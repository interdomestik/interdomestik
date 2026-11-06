// Shared mocks for the sendMessageDbCore tests (send.test.ts and send-access.test.ts).
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi, type Mock } from 'vitest';

export const mocks: {
  agentAccess: Mock;
  tx: {
    insert: Mock;
    query: { claims: { findFirst: Mock }; user: { findFirst: Mock } };
    select: Mock;
  };
  withTenantContext: Mock;
} = {
  agentAccess: vi.fn(),
  tx: {
    insert: vi.fn(),
    query: {
      claims: { findFirst: vi.fn() },
      user: { findFirst: vi.fn() },
    },
    select: vi.fn(),
  },
  withTenantContext: vi.fn(),
};

vi.mock('@interdomestik/database', () => ({
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
  user: { id: 'u.id', image: 'u.image', name: 'u.name', role: 'u.role' },
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn(() => ({ scoped: true })),
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
vi.mock('./access', async importOriginal => ({
  ...(await importOriginal<typeof import('./access')>()),
  hasAgentClaimAccess: mocks.agentAccess,
}));
vi.mock('nanoid', () => ({ nanoid: () => 'message-1' }));

export const authority: TenantAuthority = mintTestTenantAuthority('tenant-1');
export const projectionFrom = () => ({
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
  mocks.tx.query.claims.findFirst.mockResolvedValue({
    id: 'claim-1',
    title: 'Claim',
    userId: 'member-1',
  });
  mocks.tx.query.user.findFirst.mockResolvedValue({ email: 'member@example.com' });
  mocks.tx.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  mocks.tx.select.mockReturnValue({ from: projectionFrom });
}
