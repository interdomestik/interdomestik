import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const mainQuery = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn(),
  };

  const countQuery = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };

  return {
    dbSelect: vi.fn(),
    mapClaimsToOperationalRows: vi.fn(),
    getAdminClaimStats: vi.fn(),
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((a: unknown, b: unknown) => `eq:${String(a)}:${String(b)}`),
    desc: vi.fn((field: unknown) => `desc:${String(field)}`),
    or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
    ilike: vi.fn((field: unknown, pattern: unknown) => `ilike:${String(field)}:${String(pattern)}`),
    inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
    count: vi.fn(() => 'count(*)'),
    aliasedTable: vi.fn((_table: unknown, alias: string) => ({ __alias: alias })),
    mainQuery,
    countQuery,
  };
});

vi.mock('@interdomestik/database', () => ({
  db: {
    select: hoisted.dbSelect,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenantId',
    userId: 'claims.userId',
    staffId: 'claims.staffId',
    branchId: 'claims.branchId',
    title: 'claims.title',
    status: 'claims.status',
    createdAt: 'claims.createdAt',
    updatedAt: 'claims.updatedAt',
    assignedAt: 'claims.assignedAt',
    category: 'claims.category',
    currency: 'claims.currency',
    claimNumber: 'claims.claimNumber',
  },
  user: {
    id: 'user.id',
    name: 'user.name',
    email: 'user.email',
  },
  branches: {
    id: 'branches.id',
    code: 'branches.code',
    name: 'branches.name',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
  desc: hoisted.desc,
  or: hoisted.or,
  ilike: hoisted.ilike,
  inArray: hoisted.inArray,
  count: hoisted.count,
  aliasedTable: hoisted.aliasedTable,
}));

vi.mock('../mappers', () => ({
  mapClaimsToOperationalRows: hoisted.mapClaimsToOperationalRows,
}));

vi.mock('./getAdminClaimStats', () => ({
  getAdminClaimStats: hoisted.getAdminClaimStats,
}));

import { getAdminClaimsV2 } from './getAdminClaimsV2';

function mockQueryResults(rawRows: unknown[], totalCount: number) {
  hoisted.mainQuery.offset.mockResolvedValue(rawRows);
  hoisted.countQuery.where.mockResolvedValue([{ totalCount }]);
  hoisted.dbSelect
    .mockImplementationOnce(() => hoisted.mainQuery)
    .mockImplementationOnce(() => hoisted.countQuery);
}

describe('getAdminClaimsV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mapClaimsToOperationalRows.mockReturnValue([]);
    hoisted.getAdminClaimStats.mockResolvedValue({
      intake: 0,
      verification: 0,
      processing: 0,
      negotiation: 0,
      legal: 0,
      completed: 0,
    });
  });

  it('applies tenant predicate at query boundary for list reads', async () => {
    mockQueryResults([], 0);

    await getAdminClaimsV2({
      tenantId: 'tenant-A',
      userId: 'u1',
      role: 'admin',
      branchId: null,
    });

    const andCallArgs = hoisted.and.mock.calls[0] ?? [];
    expect(andCallArgs).toContain('eq:claims.tenantId:tenant-A');
  });

  it('uses deterministic ordering: updatedAt desc then id desc', async () => {
    mockQueryResults([], 0);

    await getAdminClaimsV2({
      tenantId: 'tenant-A',
      userId: 'u1',
      role: 'admin',
      branchId: null,
    });

    expect(hoisted.mainQuery.orderBy).toHaveBeenCalledWith(
      'desc:claims.updatedAt',
      'desc:claims.id'
    );
  });

  it('returns deterministic results for same filters', async () => {
    const mappedRows = [{ id: 'c2' }, { id: 'c1' }];
    hoisted.mapClaimsToOperationalRows.mockReturnValue(mappedRows);

    mockQueryResults([{ id: 'raw-1' }], 2);
    const first = await getAdminClaimsV2(
      { tenantId: 'tenant-A', userId: 'u1', role: 'admin', branchId: null },
      { lifecycleStage: 'intake', search: 'alpha', page: 1 }
    );

    const firstOrderByArgs = hoisted.mainQuery.orderBy.mock.calls[0];

    mockQueryResults([{ id: 'raw-1' }], 2);
    const second = await getAdminClaimsV2(
      { tenantId: 'tenant-A', userId: 'u1', role: 'admin', branchId: null },
      { lifecycleStage: 'intake', search: 'alpha', page: 1 }
    );

    const secondOrderByArgs = hoisted.mainQuery.orderBy.mock.calls[1];

    expect(first.rows).toEqual(second.rows);
    expect(first.pagination).toEqual(second.pagination);
    expect(firstOrderByArgs).toEqual(secondOrderByArgs);
  });

  it('handles unknown filter values safely as fail-closed no-op', async () => {
    mockQueryResults([], 0);

    await expect(
      getAdminClaimsV2(
        { tenantId: 'tenant-A', userId: 'u1', role: 'admin', branchId: null },
        { lifecycleStage: 'not-a-real-stage' as never, status: '__bad__', assigned: '__bad__' }
      )
    ).resolves.not.toThrow();

    const andCallArgs = hoisted.and.mock.calls[0] ?? [];
    expect(andCallArgs).toEqual(['eq:claims.tenantId:tenant-A']);
    expect(hoisted.inArray).not.toHaveBeenCalled();
  });
});
