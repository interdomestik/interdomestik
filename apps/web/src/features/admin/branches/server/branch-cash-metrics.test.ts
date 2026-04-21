import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const queryPlans: Array<{
    terminal: 'where' | 'groupBy';
    result: Array<Record<string, unknown>>;
  }> = [];

  const db = {
    select: vi.fn(() => {
      const plan = queryPlans.shift();
      if (!plan) {
        throw new Error('Missing query plan');
      }

      const chain = {
        from: vi.fn(() => chain),
        innerJoin: vi.fn(() => chain),
        where: vi.fn(() => (plan.terminal === 'where' ? Promise.resolve(plan.result) : chain)),
        groupBy: vi.fn(() => Promise.resolve(plan.result)),
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
  };
});

vi.mock('@interdomestik/database/db', () => ({
  db: mocks.db,
}));

vi.mock('@interdomestik/database/schema', () => ({
  leadPaymentAttempts: {
    id: 'lead_payment_attempts.id',
    leadId: 'lead_payment_attempts.lead_id',
    method: 'lead_payment_attempts.method',
    status: 'lead_payment_attempts.status',
    tenantId: 'lead_payment_attempts.tenant_id',
  },
  memberLeads: {
    agentId: 'member_leads.agent_id',
    branchId: 'member_leads.branch_id',
    id: 'member_leads.id',
    tenantId: 'member_leads.tenant_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  count: mocks.count,
  eq: mocks.eq,
  inArray: mocks.inArray,
}));

import {
  BRANCH_CASH_OPEN_STATUSES,
  getBranchCashPendingByAgent,
  getBranchCashPendingByBranch,
  getBranchCashPendingCount,
} from './branch-cash-metrics';

describe('branch cash metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryPlans.length = 0;
  });

  it('counts unresolved cash verification load for one tenant branch', async () => {
    mocks.queryPlans.push({ terminal: 'where', result: [{ count: 2 }] });

    await expect(
      getBranchCashPendingCount({ tenantId: 'tenant-1', branchId: 'branch-1' })
    ).resolves.toBe(2);

    expect(mocks.eq).toHaveBeenCalledWith('lead_payment_attempts.tenant_id', 'tenant-1');
    expect(mocks.eq).toHaveBeenCalledWith('member_leads.tenant_id', 'tenant-1');
    expect(mocks.eq).toHaveBeenCalledWith('member_leads.branch_id', 'branch-1');
    expect(mocks.eq).toHaveBeenCalledWith('lead_payment_attempts.method', 'cash');
    expect(mocks.inArray).toHaveBeenCalledWith('lead_payment_attempts.status', [
      ...BRANCH_CASH_OPEN_STATUSES,
    ]);
  });

  it('groups unresolved cash verification load by branch', async () => {
    mocks.queryPlans.push({
      terminal: 'groupBy',
      result: [
        { branchId: 'branch-1', count: 3 },
        { branchId: 'branch-2', count: 1 },
      ],
    });

    const result = await getBranchCashPendingByBranch('tenant-1');

    expect(result).toEqual(
      new Map([
        ['branch-1', 3],
        ['branch-2', 1],
      ])
    );
    expect(mocks.eq).toHaveBeenCalledWith('lead_payment_attempts.tenant_id', 'tenant-1');
    expect(mocks.eq).toHaveBeenCalledWith('member_leads.tenant_id', 'tenant-1');
  });

  it('groups unresolved cash verification load by lead agent within one branch', async () => {
    mocks.queryPlans.push({
      terminal: 'groupBy',
      result: [
        { agentId: 'agent-1', count: 4 },
        { agentId: 'agent-2', count: 2 },
      ],
    });

    const result = await getBranchCashPendingByAgent({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
    });

    expect(result).toEqual(
      new Map([
        ['agent-1', 4],
        ['agent-2', 2],
      ])
    );
    expect(mocks.eq).toHaveBeenCalledWith('member_leads.branch_id', 'branch-1');
  });
});
