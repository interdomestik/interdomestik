import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tx: {
    insert: vi.fn(),
    query: {
      claims: { findFirst: vi.fn() },
      user: { findFirst: vi.fn() },
    },
    select: vi.fn(),
  },
  withTenantContext: vi.fn(),
}));

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
vi.mock('nanoid', () => ({ nanoid: () => 'message-1' }));

import { sendMessageDbCore } from './send';

const authority = mintTestTenantAuthority('tenant-1');
const staffSession = { user: { id: 'staff-1', role: 'admin', tenantId: 'tenant-1' } };

describe('sendMessageDbCore authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantContext.mockImplementation(
      async (_authority: unknown, action: (tx: unknown) => unknown) => action(mocks.tx)
    );
    mocks.tx.query.claims.findFirst.mockResolvedValue({
      id: 'claim-1',
      title: 'Claim',
      userId: 'member-1',
    });
    mocks.tx.query.user.findFirst.mockResolvedValue({ email: 'member@example.com' });
    mocks.tx.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    mocks.tx.select.mockReturnValue({
      from: () => ({
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
      }),
    });
  });

  it('rejects a send that holds no authority without opening a tenant transaction', async () => {
    const result = await sendMessageDbCore({
      session: staffSession,
      authority: null,
      requestHeaders: new Headers(),
      claimId: 'claim-1',
      content: 'Hello',
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('writes under the supplied authority and audits with the same authority', async () => {
    const logAuditEvent = vi.fn();

    const result = await sendMessageDbCore({
      session: staffSession,
      authority,
      requestHeaders: new Headers(),
      claimId: 'claim-1',
      content: 'Hello',
      deps: { logAuditEvent },
    });

    expect(result).toMatchObject({
      success: true,
      claim: { id: 'claim-1', tenantId: 'tenant-1' },
    });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent.mock.calls[0]?.[0]).toMatchObject({ action: 'claim.message_sent' });
    expect(logAuditEvent.mock.calls[0]?.[0].authority).toBe(authority);
  });
});
