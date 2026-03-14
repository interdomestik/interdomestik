import { beforeEach, describe, expect, it, vi } from 'vitest';

function createSelectChain() {
  return {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
}

const NOW = new Date('2026-03-14T12:00:00.000Z');

const mocks = vi.hoisted(() => {
  const subscriptionSelectChain = createSelectChain();
  const membershipPlanSelectChain = createSelectChain();
  const serviceUsageCountSelectChain = createSelectChain();

  return {
    db: { select: vi.fn() },
    subscriptions: {
      id: 'subscriptions.id',
      tenantId: 'subscriptions.tenant_id',
      userId: 'subscriptions.user_id',
      planId: 'subscriptions.plan_id',
      planKey: 'subscriptions.plan_key',
      currentPeriodStart: 'subscriptions.current_period_start',
      currentPeriodEnd: 'subscriptions.current_period_end',
    },
    membershipPlans: {
      id: 'membership_plans.id',
      tenantId: 'membership_plans.tenant_id',
      paddlePriceId: 'membership_plans.paddle_price_id',
      tier: 'membership_plans.tier',
    },
    serviceUsage: {
      id: 'service_usage.id',
      tenantId: 'service_usage.tenant_id',
      subscriptionId: 'service_usage.subscription_id',
      serviceCode: 'service_usage.service_code',
      usedAt: 'service_usage.used_at',
    },
    subscriptionSelectChain,
    membershipPlanSelectChain,
    serviceUsageCountSelectChain,
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    or: vi.fn((...conditions) => ({ op: 'or', conditions })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: [...strings],
      values,
    })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  db: mocks.db,
  eq: mocks.eq,
  membershipPlans: mocks.membershipPlans,
  or: mocks.or,
  serviceUsage: mocks.serviceUsage,
  sql: mocks.sql,
  subscriptions: mocks.subscriptions,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

import { getMatterAllowanceVisibilityForUser } from './matter-allowance';

describe('getMatterAllowanceVisibilityForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.select.mockReset();

    mocks.subscriptionSelectChain.from.mockReturnValue(mocks.subscriptionSelectChain);
    mocks.subscriptionSelectChain.where.mockReturnValue(mocks.subscriptionSelectChain);
    mocks.membershipPlanSelectChain.from.mockReturnValue(mocks.membershipPlanSelectChain);
    mocks.membershipPlanSelectChain.where.mockReturnValue(mocks.membershipPlanSelectChain);
    mocks.serviceUsageCountSelectChain.from.mockReturnValue(mocks.serviceUsageCountSelectChain);
    mocks.serviceUsageCountSelectChain.where.mockReturnValue(mocks.serviceUsageCountSelectChain);
  });

  it('returns zero consumed and the full remaining annual allowance when no usage exists yet', async () => {
    mocks.db.select
      .mockReturnValueOnce(mocks.subscriptionSelectChain)
      .mockReturnValueOnce(mocks.membershipPlanSelectChain)
      .mockReturnValueOnce(mocks.serviceUsageCountSelectChain);

    mocks.subscriptionSelectChain.limit.mockResolvedValue([
      {
        id: 'sub-1',
        planId: 'plan-standard',
        planKey: null,
        currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
        currentPeriodEnd: null,
      },
    ]);
    mocks.membershipPlanSelectChain.limit.mockResolvedValue([{ tier: 'standard' }]);
    mocks.serviceUsageCountSelectChain.limit.mockResolvedValue([{ count: 0 }]);

    const result = await getMatterAllowanceVisibilityForUser({
      tenantId: 'tenant-1',
      userId: 'member-1',
      now: NOW,
    });

    expect(result).toEqual({
      allowanceTotal: 2,
      consumedCount: 0,
      remainingCount: 2,
      windowStart: new Date('2026-01-01T00:00:00.000Z'),
      windowEnd: NOW,
    });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      mocks.subscriptions.tenantId,
      expect.any(Object)
    );
  });

  it('uses the family allowance semantics and clamps remaining allowance at zero', async () => {
    mocks.db.select
      .mockReturnValueOnce(mocks.subscriptionSelectChain)
      .mockReturnValueOnce(mocks.membershipPlanSelectChain)
      .mockReturnValueOnce(mocks.serviceUsageCountSelectChain);

    mocks.subscriptionSelectChain.limit.mockResolvedValue([
      {
        id: 'sub-2',
        planId: 'pri_family_123',
        planKey: null,
        currentPeriodStart: null,
        currentPeriodEnd: new Date('2026-12-31T23:59:59.000Z'),
      },
    ]);
    mocks.membershipPlanSelectChain.limit.mockResolvedValue([{ tier: 'family' }]);
    mocks.serviceUsageCountSelectChain.limit.mockResolvedValue([{ count: 7 }]);

    const result = await getMatterAllowanceVisibilityForUser({
      tenantId: 'tenant-1',
      userId: 'member-2',
      now: NOW,
    });

    expect(result).toEqual({
      allowanceTotal: 5,
      consumedCount: 7,
      remainingCount: 0,
      windowStart: new Date('2025-12-31T00:00:00.000Z'),
      windowEnd: new Date('2026-12-31T23:59:59.000Z'),
    });
  });

  it('returns null when the member has no subscription context', async () => {
    mocks.db.select.mockReturnValueOnce(mocks.subscriptionSelectChain);
    mocks.subscriptionSelectChain.limit.mockResolvedValue([]);

    const result = await getMatterAllowanceVisibilityForUser({
      tenantId: 'tenant-1',
      userId: 'member-3',
      now: NOW,
    });

    expect(result).toBeNull();
  });
});
