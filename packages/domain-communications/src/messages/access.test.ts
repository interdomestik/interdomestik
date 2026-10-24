import type { TenantTransaction } from '@interdomestik/database';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ambientFindFirst: vi.fn(),
  ambientSelect: vi.fn(),
  txFindFirst: vi.fn(),
  actorFindFirst: vi.fn(),
  txSelect: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: { agentClients: { findFirst: mocks.ambientFindFirst } },
    select: mocks.ambientSelect,
  },
  agentClients: {
    agentId: 'agentClients.agentId',
    memberId: 'agentClients.memberId',
    status: 'agentClients.status',
    tenantId: 'agentClients.tenantId',
  },
  claims: {
    id: 'claims.id',
    branchId: 'claims.branchId',
    staffId: 'claims.staffId',
    tenantId: 'claims.tenantId',
    userId: 'claims.userId',
  },
  user: { id: 'user.id', tenantId: 'user.tenantId' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions) => ({ op: 'and', conditions })),
  eq: vi.fn((column, value) => ({ op: 'eq', column, value })),
  inArray: vi.fn((column, values) => ({ op: 'inArray', column, values })),
  isNull: vi.fn(column => ({ op: 'isNull', column })),
  or: vi.fn((...conditions) => ({ op: 'or', conditions })),
}));

import { hasAgentClaimAccess } from './access';

const tx = {
  query: {
    agentClients: { findFirst: mocks.txFindFirst },
    user: { findFirst: mocks.actorFindFirst },
  },
  select: mocks.txSelect,
} as unknown as TenantTransaction;

describe('message claim access transaction boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actorFindFirst.mockResolvedValue({ branchId: 'branch-a' });
    mocks.txSelect.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ kind: 'tenant-subquery' });
  });
  it('reads the active agent link through the supplied tenant transaction', async () => {
    mocks.txFindFirst.mockResolvedValue({ memberId: 'member-1' });

    await expect(
      hasAgentClaimAccess({
        agentId: 'agent-1',
        agentBranchId: 'branch-a',
        claimBranchId: 'branch-a',
        memberId: 'member-1',
        tenantId: 'tenant-1',
        tx,
      })
    ).resolves.toBe(true);

    expect(mocks.txFindFirst).toHaveBeenCalledWith({
      where: expect.any(Function),
    });
    expect(mocks.ambientFindFirst).not.toHaveBeenCalled();
  });
  it('denies a linked agent a wrong-branch claim before querying the relationship', async () => {
    mocks.txFindFirst.mockResolvedValue({ memberId: 'member-1' });

    await expect(
      hasAgentClaimAccess({
        agentId: 'agent-1',
        agentBranchId: 'branch-a',
        claimBranchId: 'branch-b',
        memberId: 'member-1',
        tenantId: 'tenant-1',
        tx,
      })
    ).resolves.toBe(false);

    expect(mocks.txFindFirst).not.toHaveBeenCalled();
  });
  it('allows a linked agent an unassigned-branch claim', async () => {
    mocks.txFindFirst.mockResolvedValue({ memberId: 'member-1' });

    await expect(
      hasAgentClaimAccess({
        agentId: 'agent-1',
        agentBranchId: 'branch-a',
        claimBranchId: null,
        memberId: 'member-1',
        tenantId: 'tenant-1',
        tx,
      })
    ).resolves.toBe(true);
    expect(mocks.txFindFirst).toHaveBeenCalledTimes(1);
  });
  it('denies a foreign-branch claim even when the cached session branch is null', async () => {
    mocks.txFindFirst.mockResolvedValue({ memberId: 'member-1' });
    await expect(
      hasAgentClaimAccess({
        agentId: 'agent-1',
        agentBranchId: null,
        claimBranchId: 'branch-b',
        memberId: 'member-1',
        tenantId: 'tenant-1',
        tx,
      })
    ).resolves.toBe(false);
    expect(mocks.txFindFirst).not.toHaveBeenCalled();
  });
  it('denies a missing current tenant identity before looking up a client link', async () => {
    mocks.actorFindFirst.mockResolvedValue(undefined);
    mocks.txFindFirst.mockResolvedValue({ memberId: 'member-1' });
    await expect(
      hasAgentClaimAccess({
        agentId: 'agent-1',
        agentBranchId: null,
        claimBranchId: null,
        memberId: 'member-1',
        tenantId: 'tenant-1',
        tx,
      })
    ).resolves.toBe(false);
    expect(mocks.txFindFirst).not.toHaveBeenCalled();
  });
  it('fails closed when the agent lookup has no tenant transaction', async () => {
    await expect(
      hasAgentClaimAccess({
        agentId: 'agent-1',
        agentBranchId: null,
        claimBranchId: null,
        memberId: 'member-1',
        tenantId: 'tenant-1',
      } as Parameters<typeof hasAgentClaimAccess>[0])
    ).rejects.toThrow();

    expect(mocks.ambientFindFirst).not.toHaveBeenCalled();
  });
});
