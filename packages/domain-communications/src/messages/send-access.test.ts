import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
vi.mock('./access', async importOriginal => ({
  ...(await importOriginal<typeof import('./access')>()),
  hasAgentClaimAccess: mocks.agentAccess,
}));
vi.mock('nanoid', () => ({ nanoid: () => 'message-1' }));

import { sendMessageDbCore } from './send';

const authority = mintTestTenantAuthority('tenant-1');
const projectionFrom = () => ({
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
const staffSession = { user: { id: 'staff-1', role: 'admin', tenantId: 'tenant-1' } };

// Who may send on a claim: split from send.test.ts to keep each focused test file small.
describe('sendMessageDbCore send access', () => {
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
    mocks.tx.select.mockReturnValue({ from: projectionFrom });
  });

  const DENIED = 'Access denied';
  const INTERNAL_DENIED = 'Only staff can send internal messages';
  const AGENT_DENIED = 'Access denied: You can only message your assigned clients';

  beforeEach(() => {
    mocks.tx.query.claims.findFirst.mockResolvedValue({
      id: 'claim-1',
      title: 'Claim',
      userId: 'member-1',
      branchId: 'branch-1',
      caseLifecycleState: 'submitted',
      staffId: 'staff-9',
    });
  });

  const send = (user: Record<string, string>, isInternal = false) =>
    sendMessageDbCore({
      session: { user: { tenantId: 'tenant-1', ...user } } as typeof staffSession,
      authority,
      requestHeaders: new Headers(),
      claimId: 'claim-1',
      content: 'Hello',
      isInternal,
    });

  // The branch manager owns the claim, so only the branch-manager rule can deny it.
  it.each([
    [
      'a branch manager on their own claim',
      { id: 'member-1', role: 'branch_manager', branchId: 'branch-1' },
      false,
      DENIED,
    ],
    [
      'staff of another branch',
      { id: 'staff-2', role: 'staff', branchId: 'branch-2' },
      false,
      DENIED,
    ],
    ['a member on a claim they do not own', { id: 'member-2', role: 'user' }, false, DENIED],
    ['a member sending internally', { id: 'member-1', role: 'user' }, true, INTERNAL_DENIED],
  ])('denies %s with its established error', async (_label, user, isInternal, error) => {
    const result = await send(user, isInternal);

    expect(result).toEqual({ success: false, error });
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });

  it('denies an agent without an active link to the member', async () => {
    mocks.agentAccess.mockResolvedValue(false);

    const result = await send({ id: 'agent-1', role: 'agent', branchId: 'branch-1' });

    expect(result).toEqual({ success: false, error: AGENT_DENIED });
    expect(mocks.agentAccess).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-1', memberId: 'member-1', tenantId: 'tenant-1' })
    );
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });

  it('keeps internal messages staff-only for a linked agent', async () => {
    mocks.agentAccess.mockResolvedValue(true);

    const result = await send({ id: 'agent-1', role: 'agent', branchId: 'branch-1' }, true);

    expect(result).toEqual({ success: false, error: INTERNAL_DENIED });
  });

  it.each([
    ['staff of the claim branch', { id: 'staff-2', role: 'staff', branchId: 'branch-1' }, true],
    ['an admin of any branch', { id: 'admin-1', role: 'admin', branchId: 'branch-7' }, true],
    ['the owning member', { id: 'member-1', role: 'user' }, false],
  ])('allows %s', async (_label, user, isInternal) => {
    const result = await send(user, isInternal);

    expect(result).toMatchObject({ success: true, isInternal });
    expect(mocks.tx.insert).toHaveBeenCalledTimes(1);
  });

  it('denies staff of the claim branch a member draft without writing', async () => {
    mocks.tx.query.claims.findFirst.mockResolvedValue({
      id: 'claim-1',
      title: 'Claim',
      userId: 'member-1',
      branchId: 'branch-1',
      caseLifecycleState: 'draft',
      staffId: null,
    });
    const result = await send({ id: 'staff-2', role: 'staff', branchId: 'branch-1' }, true);

    expect(result).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });
});
