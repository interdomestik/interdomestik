import { withTenantContext } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const queryPlans: Array<{ at: 'from' | 'where'; result: Array<Record<string, unknown>> }> = [];

  const db = {
    select: vi.fn(() => {
      const plan = queryPlans.shift();
      if (!plan) {
        throw new Error('Missing query plan');
      }

      const chain = {
        from: vi.fn(() => (plan.at === 'from' ? Promise.resolve(plan.result) : chain)),
        where: vi.fn(() => Promise.resolve(plan.result)),
        innerJoin: vi.fn(() => chain),
      };

      return chain;
    }),
  };

  return {
    queryPlans,
    db,
    and: vi.fn((...conditions: unknown[]) => ({ conditions, op: 'and' })),
    count: vi.fn(() => ({ op: 'count' })),
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right, op: 'eq' })),
    claimLifecycleStatusIn: vi.fn((statuses: readonly string[]) => ({ statuses })),
    claimLifecycleStatusIs: vi.fn((status: string) => ({ op: 'claimLifecycleStatusIs', status })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    })),
    sum: vi.fn((value: unknown) => ({ op: 'sum', value })),
    listTenantIdsForPlatformAggregate: vi.fn(async (): Promise<string[]> => []),
    listSuperAdminAggregateWork: vi.fn(),
    produced: [] as unknown[],
  };
});

vi.mock('@interdomestik/database', () => ({
  listSuperAdminAggregateWork: mocks.listSuperAdminAggregateWork,
  db: mocks.db,
  withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) => cb(mocks.db)),
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentClients: {
    agentId: 'agent_clients.agent_id',
    status: 'agent_clients.status',
    tenantId: 'agent_clients.tenant_id',
  },
  agentCommissions: {
    agentId: 'agent_commissions.agent_id',
    amount: 'agent_commissions.amount',
    status: 'agent_commissions.status',
    tenantId: 'agent_commissions.tenant_id',
  },
  branches: { tenantId: 'branches.tenant_id' },
  claims: {
    agentId: 'claims.agent_id',
    branchId: 'claims.branch_id',
    status: 'claims.status',
    tenantId: 'claims.tenant_id',
  },
  tenants: { id: 'tenants.id' },
  user: {
    branchId: 'user.branch_id',
    id: 'user.id',
    role: 'user.role',
    tenantId: 'user.tenant_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  count: mocks.count,
  eq: mocks.eq,
  sql: mocks.sql,
  sum: mocks.sum,
}));

vi.mock('@interdomestik/domain-claims', () => ({
  claimLifecycleStatusIn: mocks.claimLifecycleStatusIn,
  claimLifecycleStatusIs: mocks.claimLifecycleStatusIs,
}));

import { getBranchKPIs } from './v2/branch';
import { getSuperAdminKPIs } from './v2/super-admin';
import { getTenantAdminKPIs } from './v2/tenant-admin';
import { getAgentCapacitySignal } from './v3/capacity';
import { getClaimLoadForecast } from './v3/forecast';
import { getBranchStressIndex } from './v3/stress';

function queuePlans(
  ...plans: Array<{ at: 'from' | 'where'; result: Array<Record<string, unknown>> }>
) {
  mocks.queryPlans.push(...plans);
}

const superAdminActor = mintTestTenantAuthority('tenant-home', {
  userId: 'sa-1',
  role: 'super_admin',
});
const actorWithRole = (role: string | null | undefined) =>
  role === undefined
    ? mintTestTenantAuthority('tenant-home')
    : mintTestTenantAuthority('tenant-home', { userId: 'user-1', role });

describe('domain analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryPlans.length = 0;
    mocks.listTenantIdsForPlatformAggregate.mockResolvedValue([]);
    mocks.produced.length = 0;
    // Stands in for the super-admin aggregate producer: one authority per listed tenant.
    mocks.listSuperAdminAggregateWork.mockImplementation(async () =>
      (await mocks.listTenantIdsForPlatformAggregate()).map(tenantId => {
        const authority = mintTestTenantAuthority(tenantId, {
          userId: 'sa-1',
          role: 'super_admin',
        });
        mocks.produced.push(authority);
        return { tenantId, authority };
      })
    );
  });

  it('classifies agent capacity using active clients and recent claim volume', async () => {
    queuePlans({ at: 'where', result: [{ count: 150 }] }, { at: 'where', result: [{ count: 12 }] });

    await expect(
      getAgentCapacitySignal(mintTestTenantAuthority('tenant-1'), 'agent-1')
    ).resolves.toEqual({
      capacity: 'near_limit',
      activeClients: 150,
      recentClaimsVol: 12,
    });
  });

  it('runs agent capacity inside the given tenant context with tenant predicates', async () => {
    queuePlans({ at: 'where', result: [{ count: 1 }] }, { at: 'where', result: [{ count: 2 }] });

    const authority = mintTestTenantAuthority('tenant-7');

    await getAgentCapacitySignal(authority, 'agent-1');

    expect(withTenantContext).toHaveBeenCalledTimes(1);
    expect(vi.mocked(withTenantContext).mock.calls[0][0]).toBe(authority);
    expect(mocks.eq).toHaveBeenCalledWith('agent_clients.tenant_id', 'tenant-7');
    expect(mocks.eq).toHaveBeenCalledWith('claims.tenant_id', 'tenant-7');
    expect(mocks.eq).toHaveBeenCalledWith('agent_clients.agent_id', 'agent-1');
    expect(mocks.eq).toHaveBeenCalledWith('claims.agent_id', 'agent-1');
  });

  it('builds a high-risk increasing claim load forecast', async () => {
    mocks.listTenantIdsForPlatformAggregate.mockResolvedValue(['tenant-1']);
    queuePlans({ at: 'where', result: [{ current: 1201, previous: 900 }] });

    await expect(getClaimLoadForecast(superAdminActor)).resolves.toEqual({
      trend: 'increasing',
      riskLevel: 'high',
      deltaPercent: ((1201 - 900) / 900) * 100,
    });
  });

  it('sums the claim load forecast across tenants, one tenant context each', async () => {
    mocks.listTenantIdsForPlatformAggregate.mockResolvedValue(['tenant-a', 'tenant-b']);
    queuePlans(
      { at: 'where', result: [{ current: 600, previous: 300 }] },
      { at: 'where', result: [{ current: 601, previous: 600 }] }
    );

    await expect(getClaimLoadForecast(superAdminActor)).resolves.toEqual({
      trend: 'increasing',
      riskLevel: 'high',
      deltaPercent: ((1201 - 900) / 900) * 100,
    });
    expect(withTenantContext).toHaveBeenCalledTimes(2);
    expect(mocks.listSuperAdminAggregateWork).toHaveBeenCalledWith(superAdminActor);
    expect(vi.mocked(withTenantContext).mock.calls.map(call => call[0])).toEqual(mocks.produced);
    expect(mocks.produced).toHaveLength(2);
    expect(mocks.eq).toHaveBeenCalledWith('claims.tenant_id', 'tenant-a');
    expect(mocks.eq).toHaveBeenCalledWith('claims.tenant_id', 'tenant-b');
  });

  it.each([['tenant_admin'], ['staff'], ['member'], [null], [undefined]])(
    'rejects the claim load forecast for a %s actor before any tenant read',
    async role => {
      await expect(getClaimLoadForecast(actorWithRole(role))).rejects.toThrow(
        'Unauthorized: Super Admin access required'
      );
      expect(mocks.listSuperAdminAggregateWork).not.toHaveBeenCalled();
      expect(withTenantContext).not.toHaveBeenCalled();
      expect(mocks.db.select).not.toHaveBeenCalled();
    }
  );

  it('computes branch stress with overload thresholds', async () => {
    queuePlans({ at: 'where', result: [{ count: 2 }] }, { at: 'where', result: [{ count: 12 }] });

    await expect(
      getBranchStressIndex(mintTestTenantAuthority('tenant-1'), 'branch-1')
    ).resolves.toEqual({
      averageCaseLoad: 6,
      status: 'overloaded',
      stressScore: 60,
    });
  });

  it('aggregates branch KPIs and normalizes commission totals', async () => {
    queuePlans(
      { at: 'where', result: [{ count: 4 }] },
      { at: 'where', result: [{ count: 18 }] },
      { at: 'where', result: [{ count: 7 }] },
      { at: 'where', result: [{ total: '1234.50' }] }
    );

    await expect(getBranchKPIs(mintTestTenantAuthority('tenant-1'), 'branch-1')).resolves.toEqual({
      totalAgents: 4,
      totalMembers: 18,
      claimsPending: 7,
      totalCommissionPaid: 1234.5,
    });
    expect(mocks.eq).toHaveBeenCalledWith('agent_commissions.tenant_id', 'tenant-1');
  });

  it('aggregates super-admin KPIs across tenants, summing per-tenant figures', async () => {
    mocks.listTenantIdsForPlatformAggregate.mockResolvedValue(['tenant-a', 'tenant-b']);
    queuePlans(
      // tenant-a: branches, users, claims
      { at: 'where', result: [{ count: 3 }] },
      { at: 'where', result: [{ staff: 2, agents: 10, members: 200 }] },
      { at: 'where', result: [{ total: 300, today: 4, last7d: 20, last30d: 60 }] },
      // tenant-b
      { at: 'where', result: [{ count: 5 }] },
      { at: 'where', result: [{ staff: 3, agents: 15, members: 280 }] },
      { at: 'where', result: [{ total: 300, today: 5, last7d: 24, last30d: 60 }] }
    );

    await expect(getSuperAdminKPIs(superAdminActor)).resolves.toEqual({
      totalTenants: 2,
      totalBranches: 8,
      totalStaff: 5,
      totalAgents: 25,
      totalMembers: 480,
      claimsMetrics: {
        total: 600,
        today: 9,
        last7d: 44,
        last30d: 120,
      },
    });
    expect(withTenantContext).toHaveBeenCalledTimes(2);
    expect(mocks.listSuperAdminAggregateWork).toHaveBeenCalledWith(superAdminActor);
    expect(vi.mocked(withTenantContext).mock.calls.map(call => call[0])).toEqual(mocks.produced);
    expect(mocks.produced).toHaveLength(2);
    for (const tenantId of ['tenant-a', 'tenant-b']) {
      expect(mocks.eq).toHaveBeenCalledWith('branches.tenant_id', tenantId);
      expect(mocks.eq).toHaveBeenCalledWith('user.tenant_id', tenantId);
      expect(mocks.eq).toHaveBeenCalledWith('claims.tenant_id', tenantId);
    }
  });

  it('returns zeroed super-admin KPIs when there are no tenants', async () => {
    await expect(getSuperAdminKPIs(superAdminActor)).resolves.toEqual({
      totalTenants: 0,
      totalBranches: 0,
      totalStaff: 0,
      totalAgents: 0,
      totalMembers: 0,
      claimsMetrics: { total: 0, today: 0, last7d: 0, last30d: 0 },
    });
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it.each([['tenant_admin'], ['staff'], ['agent'], ['member'], [null], [undefined]])(
    'rejects super-admin KPIs for a %s actor before any tenant read',
    async role => {
      await expect(getSuperAdminKPIs(actorWithRole(role))).rejects.toThrow(
        'Unauthorized: Super Admin access required'
      );
      expect(mocks.listSuperAdminAggregateWork).not.toHaveBeenCalled();
      expect(withTenantContext).not.toHaveBeenCalled();
      expect(mocks.db.select).not.toHaveBeenCalled();
    }
  );

  it('maps tenant claim counts into tenant admin KPI buckets', async () => {
    queuePlans(
      { at: 'where', result: [{ count: 6 }] },
      { at: 'where', result: [{ count: 14 }] },
      { at: 'where', result: [{ count: 200 }] },
      { at: 'where', result: [{ count: 11 }] },
      { at: 'where', result: [{ count: 22 }] },
      { at: 'where', result: [{ count: 33 }] },
      { at: 'where', result: [{ count: 44 }] },
      { at: 'where', result: [{ count: 5 }] }
    );

    await expect(getTenantAdminKPIs(mintTestTenantAuthority('tenant-1'))).resolves.toEqual({
      totalBranches: 6,
      totalAgents: 14,
      totalMembers: 200,
      claimsByStatus: {
        draft: 11,
        submitted: 22,
        in_review: 33,
        approved: 44,
        rejected: 5,
      },
    });
    expect(mocks.claimLifecycleStatusIs).toHaveBeenCalledTimes(4);
    expect(mocks.claimLifecycleStatusIn).toHaveBeenCalledTimes(1);
  });
});
