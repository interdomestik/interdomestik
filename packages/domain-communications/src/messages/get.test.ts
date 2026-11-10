import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  findFirst: vi.fn(),
  findAgentClient: vi.fn(),
  actorFindFirst: vi.fn(),
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
  withTenantContext: mocks.context,
  db: {
    query: {
      claims: { findFirst: mocks.findFirst },
      agentClients: { findFirst: mocks.findAgentClient },
    },
    select: vi.fn(() => mocks.selectChain),
  },
  claims: { id: 'claims.id', tenantId: 'claims.tenant_id', userId: 'claims.user_id' },
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
    tenantId: 'user.tenantId',
    name: 'user.name',
    image: 'user.image',
    role: 'user.role',
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/shared-auth')>()),
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('drizzle-orm', () => ({
  inArray: vi.fn(),
  ne: vi.fn(),
  isNull: vi.fn(),
  eq: mocks.eq,
  and: mocks.and,
  or: mocks.or,
}));

import { getMessagesForClaimCore as getMessagesForClaimCoreRaw } from './get';

const authorityOf = (session: { user: { tenantId: string } }) =>
  mintTestTenantAuthority(session.user.tenantId);

// Calls the core with the authority the request session would have produced.
const getMessagesForClaimCore = (params: { session: never | null; claimId: string }) =>
  getMessagesForClaimCoreRaw({
    ...params,
    authority: params.session ? authorityOf(params.session) : null,
  });

describe('getMessagesForClaimCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actorFindFirst.mockResolvedValue({ branchId: 'branch-a' });
    mocks.context.mockImplementation((_context, action) =>
      action({
        query: {
          claims: { findFirst: mocks.findFirst },
          agentClients: { findFirst: mocks.findAgentClient },
          user: { findFirst: mocks.actorFindFirst },
        },
        select: vi.fn(() => mocks.selectChain),
      })
    );
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.leftJoin.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.selectChain.orderBy.mockResolvedValue([]);
  });

  it('scopes claim lookup with tenant filter', async () => {
    mocks.findFirst.mockImplementationOnce(
      ({ where }: { where: (...args: unknown[]) => unknown }) => {
        where(
          { id: 'claims.id', tenantId: 'claims.tenant_id' },
          { eq: vi.fn(() => ({ eq: true })) }
        );
        return null;
      }
    );

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

    expect(result).toEqual({ success: true, messages: [], canAcknowledge: true });
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

  it('denies a linked agent messages on a wrong-branch claim', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'claim-1',
      userId: 'member-1',
      branchId: 'branch-b',
    });
    mocks.findAgentClient.mockResolvedValue({ memberId: 'member-1' });

    const result = await getMessagesForClaimCore({
      session: {
        user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1', branchId: 'branch-a' },
      } as never,
      claimId: 'claim-1',
    });

    expect(result).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.findAgentClient).not.toHaveBeenCalled();
    expect(mocks.selectChain.orderBy).not.toHaveBeenCalled();
  });

  it('allows branch manager reads for claims in their branch', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'claim-1',
      userId: 'member-1',
      branchId: 'branch-a',
      staffId: 'staff-2',
    });

    const result = await getMessagesForClaimCore({
      session: {
        user: {
          id: 'manager-1',
          role: 'branch_manager',
          tenantId: 'tenant-1',
          branchId: 'branch-a',
        },
      } as never,
      claimId: 'claim-1',
    });

    expect(result).toEqual({ success: true, messages: [], canAcknowledge: false });
    expect(mocks.selectChain.orderBy).toHaveBeenCalled();
  });
});

describe('getMessagesForClaimCore authority', () => {
  it('reads under the authority it was given, scoped to that tenant', async () => {
    mocks.context.mockImplementation((_context, action) =>
      action({
        query: { claims: { findFirst: mocks.findFirst }, agentClients: { findFirst: vi.fn() } },
        select: vi.fn(() => mocks.selectChain),
      })
    );
    mocks.findFirst.mockResolvedValue(null);
    const authority = mintTestTenantAuthority('tenant-9');

    await getMessagesForClaimCoreRaw({
      session: { user: { id: 'user-1', role: 'user', tenantId: 'tenant-1' } } as never,
      authority,
      claimId: 'claim-1',
    });

    expect(mocks.context.mock.calls.at(-1)![0]).toBe(authority);
  });

  it('refuses a missing authority without opening a tenant transaction', async () => {
    mocks.context.mockClear();

    await expect(
      getMessagesForClaimCoreRaw({
        session: { user: { id: 'user-1', role: 'user', tenantId: 'tenant-1' } } as never,
        authority: null,
        claimId: 'claim-1',
      })
    ).resolves.toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.context).not.toHaveBeenCalled();
  });
});
