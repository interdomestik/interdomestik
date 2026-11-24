// Shared mocks for the sendMessageDbCore tests (send.test.ts and send-access.test.ts).
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi, type Mock } from 'vitest';

export const mocks: {
  agentAccess: Mock;
  lockClaim: Mock;
  lockLocalActor: Mock;
  lockRecipient: Mock;
  resolveStaff: Mock;
  enqueueOwner: Mock;
  enqueueStaff: Mock;
  tx: {
    insert: Mock;
    select: Mock;
  };
  withTenantContext: Mock;
} = {
  agentAccess: vi.fn(),
  lockClaim: vi.fn(),
  lockLocalActor: vi.fn(),
  lockRecipient: vi.fn(),
  resolveStaff: vi.fn(),
  enqueueOwner: vi.fn(),
  enqueueStaff: vi.fn(),
  tx: {
    insert: vi.fn(),
    select: vi.fn(),
  },
  withTenantContext: vi.fn(),
};

vi.mock('@interdomestik/database', () => ({
  claims: { id: 'claim.id', tenantId: 'claim.tenant_id' },
  claimMessages: {
    claimId: 'cm.claim_id',
    content: 'cm.content',
    createdAt: 'cm.created_at',
    id: 'cm.id',
    isInternal: 'cm.is_internal',
    readAt: 'cm.read_at',
    senderId: 'cm.sender_id',
    tenantId: 'cm.tenant_id',
  },
  user: { id: 'u.id', image: 'u.image', name: 'u.name', role: 'u.role', tenantId: 'u.tenant_id' },
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn(() => ({ scoped: true })),
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
vi.mock('@interdomestik/domain-communications/messages/store', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/domain-communications/messages/store')>()),
  hasAgentClaimAccess: mocks.agentAccess,
}));
vi.mock('nanoid', () => ({ nanoid: () => 'message-1' }));
vi.mock('@interdomestik/domain-communications/notification-deliveries', () => ({
  lockClaimNotificationRecipient: mocks.lockRecipient,
  enqueueClaimMessageNotification: mocks.enqueueOwner,
  enqueueStaffClaimNotification: mocks.enqueueStaff,
}));
vi.mock('../staff-claims/notification-recipients', () => ({
  resolveStaffClaimNotificationRecipients: mocks.resolveStaff,
}));
vi.mock('./response-requests', () => claimEffects);

export const claimEffects: { createClaimResponseRequest: Mock; answerClaimResponseRequests: Mock } =
  {
    createClaimResponseRequest: vi.fn(),
    answerClaimResponseRequests: vi.fn(),
  };

export const authority: TenantAuthority = mintTestTenantAuthority('tenant-1', {
  userId: 'staff-1',
  role: 'admin',
});
export const projectionFrom = (replayLookup?: Mock) => ({
  where: () => ({
    for: mocks.lockClaim,
    limit: () => ({ for: replayLookup }),
  }),
  leftJoin: () => ({
    where: () => ({
      limit: () =>
        Promise.resolve([
          {
            id: 'message-1',
            claimId: 'claim-1',
            senderId: 'staff-1',
            content: 'Hello',
            isInternal: false,
            readAt: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            sender: { id: 'staff-1', name: 'Staff', image: null, role: 'admin' },
          },
        ]),
    }),
  }),
});
export const staffSession = { user: { id: 'staff-1', role: 'admin', tenantId: 'tenant-1' } };

/** Shared per-test reset: a tenant transaction over the mocked handle and an owned claim. */
export function resetSendMocks(): void {
  vi.clearAllMocks();
  mocks.withTenantContext.mockImplementation(
    (_authority: unknown, action: (tx: unknown) => unknown) => Promise.resolve(action(mocks.tx))
  );
  mocks.lockClaim.mockResolvedValue([{ title: 'Claim', userId: 'member-1' }]);
  mocks.lockLocalActor.mockResolvedValue([{ id: 'admin-1' }]);
  mocks.lockRecipient.mockResolvedValue({ id: 'member-1', role: 'member', emailVerified: true });
  mocks.resolveStaff.mockResolvedValue([{ id: 'staff-1', role: 'staff', emailVerified: true }]);
  mocks.enqueueOwner.mockResolvedValue(['email-1']);
  mocks.enqueueStaff.mockResolvedValue(['email-2']);
  mocks.tx.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  mocks.tx.select.mockReturnValue({
    from: (table: { id: string }) =>
      table.id === 'u.id' ? { where: () => ({ for: mocks.lockLocalActor }) } : projectionFrom(),
  });
}
