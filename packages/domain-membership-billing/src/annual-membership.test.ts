import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  and: vi.fn((...conditions) => ({ op: 'and', conditions })),
  asc: vi.fn(column => ({ op: 'asc', column })),
  db: {
    select: vi.fn(),
  },
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
  membershipPlans: {
    id: 'membership_plans.id',
    interval: 'membership_plans.interval',
    isActive: 'membership_plans.is_active',
    paddlePriceId: 'membership_plans.paddle_price_id',
    tenantId: 'membership_plans.tenant_id',
    tier: 'membership_plans.tier',
  },
}));

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  asc: hoisted.asc,
  db: hoisted.db,
  eq: hoisted.eq,
  membershipPlans: hoisted.membershipPlans,
}));

import {
  createActiveAnnualMembershipFulfillment,
  createActiveAnnualMembershipState,
  createCanonicalMembershipPlanState,
  resolveCanonicalMembershipPlanState,
} from './annual-membership';

beforeEach(() => {
  hoisted.and.mockClear();
  hoisted.asc.mockClear();
  hoisted.db.select.mockReset();
  hoisted.eq.mockClear();
});

describe('createActiveAnnualMembershipState', () => {
  it('builds an active annual membership term from a single baseline timestamp', () => {
    const now = new Date('2026-04-16T09:00:00.000Z');

    expect(createActiveAnnualMembershipState(now)).toEqual({
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date('2027-04-16T09:00:00.000Z'),
    });
  });

  it('keeps leap-day memberships anchored to the same baseline instant', () => {
    const now = new Date('2024-02-29T12:30:00.000Z');

    expect(createActiveAnnualMembershipState(now)).toEqual({
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date('2025-03-01T12:30:00.000Z'),
    });
  });
});

describe('createCanonicalMembershipPlanState', () => {
  it('stores a tenant-resolved plan key alongside the canonical annual plan id', () => {
    expect(createCanonicalMembershipPlanState('standard', 'tenant-standard-plan')).toEqual({
      planId: 'standard',
      planKey: 'tenant-standard-plan',
    });
  });
});

describe('resolveCanonicalMembershipPlanState', () => {
  it('falls back to an explicit unknown plan id when the incoming value is blank', async () => {
    await expect(
      resolveCanonicalMembershipPlanState({
        tenantId: 'tenant-mk',
        planId: '   ',
      })
    ).resolves.toEqual({
      planId: 'unknown',
      planKey: null,
    });

    expect(hoisted.db.select).not.toHaveBeenCalled();
  });

  it('checks id and provider ids before attempting the canonical annual tier match', async () => {
    const selectChain = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    };

    selectChain.from.mockReturnValue(selectChain);
    selectChain.where.mockReturnValue(selectChain);
    selectChain.orderBy.mockReturnValue(selectChain);
    selectChain.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'tenant-standard-plan', tier: 'standard' }]);

    hoisted.db.select.mockReturnValue(selectChain);

    await expect(
      resolveCanonicalMembershipPlanState({
        tenantId: 'tenant-mk',
        planId: 'standard',
      })
    ).resolves.toEqual({
      planId: 'standard',
      planKey: 'tenant-standard-plan',
    });

    expect(hoisted.db.select).toHaveBeenCalledTimes(3);
    expect(selectChain.orderBy).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a tier lookup for non-tier provider ids', async () => {
    const selectChain = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    };

    selectChain.from.mockReturnValue(selectChain);
    selectChain.where.mockReturnValue(selectChain);
    selectChain.orderBy.mockReturnValue(selectChain);
    selectChain.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    hoisted.db.select.mockReturnValue(selectChain);

    await expect(
      resolveCanonicalMembershipPlanState({
        tenantId: 'tenant-mk',
        planId: 'pri_standard_year',
      })
    ).resolves.toEqual({
      planId: 'pri_standard_year',
      planKey: null,
    });

    expect(hoisted.db.select).toHaveBeenCalledTimes(2);
    expect(selectChain.orderBy).not.toHaveBeenCalled();
  });

  it('returns the exact plan row when the incoming value already is a membership plan id', async () => {
    const selectChain = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    };

    selectChain.from.mockReturnValue(selectChain);
    selectChain.where.mockReturnValue(selectChain);
    selectChain.orderBy.mockReturnValue(selectChain);
    selectChain.limit.mockResolvedValueOnce([{ id: 'tenant-family-plan', tier: 'family' }]);

    hoisted.db.select.mockReturnValue(selectChain);

    await expect(
      resolveCanonicalMembershipPlanState({
        tenantId: 'tenant-mk',
        planId: 'tenant-family-plan',
      })
    ).resolves.toEqual({
      planId: 'family',
      planKey: 'tenant-family-plan',
    });

    expect(hoisted.db.select).toHaveBeenCalledTimes(1);
    expect(selectChain.orderBy).not.toHaveBeenCalled();
  });
});

describe('createActiveAnnualMembershipFulfillment', () => {
  it('builds the canonical commercial shape for an active annual membership', () => {
    const now = new Date('2026-04-16T09:00:00.000Z');

    expect(createActiveAnnualMembershipFulfillment('family', now, 'tenant-family-plan')).toEqual({
      status: 'active',
      planId: 'family',
      planKey: 'tenant-family-plan',
      currentPeriodStart: now,
      currentPeriodEnd: new Date('2027-04-16T09:00:00.000Z'),
    });
  });
});
