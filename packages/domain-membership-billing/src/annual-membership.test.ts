import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  db: {
    query: {
      membershipPlans: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('@interdomestik/database', () => ({
  db: hoisted.db,
}));

import {
  createActiveAnnualMembershipFulfillment,
  createActiveAnnualMembershipState,
  createCanonicalMembershipPlanState,
  resolveCanonicalMembershipPlanState,
} from './annual-membership';

beforeEach(() => {
  hoisted.db.query.membershipPlans.findFirst.mockReset();
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

    expect(hoisted.db.query.membershipPlans.findFirst).not.toHaveBeenCalled();
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
