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
    inArray: vi.fn((left: unknown, right: unknown[]) => ({ left, right, op: 'inArray' })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    })),
    sum: vi.fn((value: unknown) => ({ op: 'sum', value })),
  };
});

vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentClients: {
    agentId: 'agent_clients.agent_id',
    status: 'agent_clients.status',
  },
  agentCommissions: {
    agentId: 'agent_commissions.agent_id',
    amount: 'agent_commissions.amount',
    status: 'agent_commissions.status',
    tenantId: 'agent_commissions.tenant_id',
  },
  branches: {
    tenantId: 'branches.tenant_id',
  },
  claims: {
    agentId: 'claims.agent_id',
    branchId: 'claims.branch_id',
    status: 'claims.status',
    tenantId: 'claims.tenant_id',
  },
  tenants: {
    id: 'tenants.id',
  },
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
  inArray: mocks.inArray,
  sql: mocks.sql,
  sum: mocks.sum,
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

describe('domain analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryPlans.length = 0;
  });

  it('classifies agent capacity using active clients and recent claim volume', async () => {
    queuePlans({ at: 'where', result: [{ count: 150 }] }, { at: 'where', result: [{ count: 12 }] });

    await expect(getAgentCapacitySignal('agent-1')).resolves.toEqual({
      capacity: 'near_limit',
      activeClients: 150,
      recentClaimsVol: 12,
    });
  });

  it('builds a high-risk increasing claim load forecast', async () => {
    queuePlans(
      { at: 'where', result: [{ count: 1201 }] },
      { at: 'where', result: [{ count: 900 }] }
    );

    await expect(getClaimLoadForecast()).resolves.toEqual({
      trend: 'increasing',
      riskLevel: 'high',
      deltaPercent: ((1201 - 900) / 900) * 100,
    });
  });

  it('computes branch stress with overload thresholds', async () => {
    queuePlans({ at: 'where', result: [{ count: 2 }] }, { at: 'where', result: [{ count: 12 }] });

    await expect(getBranchStressIndex('tenant-1', 'branch-1')).resolves.toEqual({
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

    await expect(getBranchKPIs('tenant-1', 'branch-1')).resolves.toEqual({
      totalAgents: 4,
      totalMembers: 18,
      claimsPending: 7,
      totalCommissionPaid: 1234.5,
    });
    expect(mocks.eq).toHaveBeenCalledWith('agent_commissions.tenant_id', 'tenant-1');
  });

  it('aggregates global super-admin KPIs across tenants, branches, users, and claims', async () => {
    queuePlans(
      { at: 'from', result: [{ count: 3 }] },
      { at: 'from', result: [{ count: 8 }] },
      { at: 'where', result: [{ count: 5 }] },
      { at: 'where', result: [{ count: 25 }] },
      { at: 'where', result: [{ count: 480 }] },
      { at: 'from', result: [{ count: 600 }] },
      { at: 'where', result: [{ count: 9 }] },
      { at: 'where', result: [{ count: 44 }] },
      { at: 'where', result: [{ count: 120 }] }
    );

    await expect(getSuperAdminKPIs()).resolves.toEqual({
      totalTenants: 3,
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
  });

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

    await expect(getTenantAdminKPIs('tenant-1')).resolves.toEqual({
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
  });
});
