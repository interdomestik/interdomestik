import { vi, type Mock } from 'vitest';
export function createStaffClaimsListMocks() {
  const fn = <F extends (...args: any[]) => any>(implementation?: F): Mock<F> =>
    vi.fn(implementation);
  const claimChain = {
    from: fn(),
    leftJoin: fn(),
    where: fn(),
    orderBy: fn(),
    limit: fn(),
  };
  const historyChain = {
    from: fn(),
    where: fn(),
    orderBy: fn(),
  };
  const diasporaClaimsChain = {
    from: fn(),
    where: fn(),
  };
  return {
    claimChain,
    historyChain,
    diasporaClaimsChain,
    db: { select: fn(), selectDistinctOn: fn() },
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      staffId: 'claims.staff_id',
      claimNumber: 'claims.claim_number',
      companyName: 'claims.company_name',
      status: 'claims.status',
      caseLifecycleState: 'claims.case_lifecycle_state',
      recoveryLifecycleState: 'claims.recovery_lifecycle_state',
      title: 'claims.title',
      updatedAt: 'claims.updated_at',
      userId: 'claims.user_id',
    },
    claimStageHistory: {
      id: 'claim_stage_history.id',
      tenantId: 'claim_stage_history.tenant_id',
      claimId: 'claim_stage_history.claim_id',
      note: 'claim_stage_history.note',
      createdAt: 'claim_stage_history.created_at',
    },
    user: {
      id: 'user.id',
      name: 'user.name',
      email: 'user.email',
      memberNumber: 'user.member_number',
    },
    aliasedTable: fn((table, alias) => ({
      ...table,
      email: `${alias}.email`,
      id: `${alias}.id`,
      name: `${alias}.name`,
    })),
    eq: fn((left, right) => ({ left, right, op: 'eq' })),
    and: fn((...conditions) => ({ conditions, op: 'and' })),
    desc: fn(value => ({ value, op: 'desc' })),
    ilike: fn((column, value) => ({ column, value, op: 'ilike' })),
    inArray: fn((column, values) => ({ column, values, op: 'inArray' })),
    or: fn((...conditions) => ({ conditions, op: 'or' })),
    isNull: fn(column => ({ column, op: 'isNull' })),
    withTenant: fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
  };
}
export function resetStaffClaimsListMocks(mocks: ReturnType<typeof createStaffClaimsListMocks>) {
  mocks.and.mockClear();
  mocks.db.select.mockReset();
  mocks.db.selectDistinctOn.mockReset();
  mocks.db.select.mockReturnValueOnce(mocks.claimChain);
  mocks.db.selectDistinctOn.mockReturnValueOnce(mocks.historyChain);
  mocks.desc.mockClear();
  mocks.eq.mockClear();
  mocks.ilike.mockClear();
  mocks.inArray.mockClear();
  mocks.isNull.mockClear();
  mocks.or.mockClear();
  mocks.withTenant.mockClear();
  mocks.claimChain.from.mockReturnValue(mocks.claimChain);
  mocks.claimChain.leftJoin.mockReturnValue(mocks.claimChain);
  mocks.claimChain.where.mockReturnValue(mocks.claimChain);
  mocks.claimChain.orderBy.mockReturnValue(mocks.claimChain);
  mocks.historyChain.from.mockReturnValue(mocks.historyChain);
  mocks.historyChain.where.mockReturnValue(mocks.historyChain);
  mocks.historyChain.orderBy.mockResolvedValue([]);
  mocks.diasporaClaimsChain.from.mockReturnValue(mocks.diasporaClaimsChain);
  mocks.diasporaClaimsChain.where.mockReturnValue('diaspora-subquery');
}

export function createStaffClaimsListModuleMocks(
  mocks: ReturnType<typeof createStaffClaimsListMocks>
) {
  return {
    database: {
      db: mocks.db,
      withTenantContext: (_context: unknown, action: (db: typeof mocks.db) => unknown) =>
        action(mocks.db),
      claims: mocks.claims,
      claimStageHistory: mocks.claimStageHistory,
      user: mocks.user,
      eq: mocks.eq,
      and: mocks.and,
      desc: mocks.desc,
      ilike: mocks.ilike,
      inArray: mocks.inArray,
      or: mocks.or,
    },
    tenantSecurity: { withTenant: mocks.withTenant },
    drizzle: {
      aliasedTable: mocks.aliasedTable,
      inArray: mocks.inArray,
      or: mocks.or,
      isNull: mocks.isNull,
      sql: vi.fn(() => ({ op: 'sql' })),
    },
  };
}
