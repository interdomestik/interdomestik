import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findAgentClient: vi.fn(),
  withTenant: vi.fn(() => ({ scoped: true })),
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
  and: vi.fn((...conditions) => ({ op: 'and', conditions })),
  or: vi.fn((...conditions) => ({ op: 'or', conditions })),
  selectChain: {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  },
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: { findFirst: mocks.findFirst },
      agentClients: { findFirst: mocks.findAgentClient },
    },
    select: vi.fn(() => mocks.selectChain),
  },
  claimMessages: {
    id: 'messages.id',
    claimId: 'messages.claim_id',
    senderId: 'messages.sender_id',
    content: 'messages.content',
    isInternal: 'messages.is_internal',
    readAt: 'messages.read_at',
    createdAt: 'messages.created_at',
    tenantId: 'messages.tenant_id',
  },
  user: {
    id: 'user.id',
    name: 'user.name',
    image: 'user.image',
    role: 'user.role',
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('drizzle-orm', () => ({
  eq: mocks.eq,
  and: mocks.and,
  or: mocks.or,
}));

import { getMessagesForClaimCore } from './get';

describe('getMessagesForClaimCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.leftJoin.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.selectChain.orderBy.mockResolvedValue([]);
  });

  it('scopes claim lookup with tenant filter', async () => {
    mocks.findFirst.mockImplementationOnce(({ where }: { where: Function }) => {
      where({ id: 'claims.id', tenantId: 'claims.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
      return null;
    });

    const result = await getMessagesForClaimCore({
      session: { user: { id: 'user-1', role: 'user', tenantId: 'tenant-1' } } as never,
      claimId: 'claim-1',
    });

    expect(result).toEqual({ success: false, error: 'Claim not found' });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      'claims.tenant_id',
      expect.any(Object)
    );
  });

  it('filters internal messages out of member reads', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'claim-1',
      userId: 'member-1',
    });

    const result = await getMessagesForClaimCore({
      session: { user: { id: 'member-1', role: 'user', tenantId: 'tenant-1' } } as never,
      claimId: 'claim-1',
    });

    expect(result).toEqual({ success: true, messages: [] });
    expect(mocks.withTenant).toHaveBeenLastCalledWith('tenant-1', 'messages.tenant_id', {
      op: 'and',
      conditions: [
        { op: 'eq', left: 'messages.claim_id', right: 'claim-1' },
        { op: 'eq', left: 'messages.is_internal', right: false },
      ],
    });
  });

  it('denies staff reads for claims outside their scoped branch', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'claim-1',
      userId: 'member-1',
      branchId: 'branch-b',
      staffId: 'staff-2',
    });

    const result = await getMessagesForClaimCore({
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1', branchId: 'branch-a' },
      } as never,
      claimId: 'claim-1',
    });

    expect(result).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.selectChain.orderBy).not.toHaveBeenCalled();
  });
});
