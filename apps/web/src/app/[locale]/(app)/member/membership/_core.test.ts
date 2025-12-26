import { describe, expect, it } from 'vitest';

import {
  computeDunningState,
  getDaysRemaining,
  isGracePeriodExpired,
  type MembershipDunningState,
} from './_core';

describe('membership core', () => {
  it('getDaysRemaining returns 0 for null end date', () => {
    expect(getDaysRemaining({ endDate: null, now: new Date('2025-01-01T00:00:00Z') })).toBe(0);
  });

  it('isGracePeriodExpired returns false for null end date', () => {
    expect(isGracePeriodExpired({ endDate: null, now: new Date('2025-01-01T00:00:00Z') })).toBe(
      false
    );
  });

  it('computes grace period state for past_due subscription', () => {
    const now = new Date('2025-01-01T00:00:00Z');
    const gracePeriodEndsAt = new Date('2025-01-04T00:00:00Z');

    const dunning = computeDunningState({
      now,
      subscription: {
        status: 'past_due',
        gracePeriodEndsAt,
      },
    });

    expect(dunning).toEqual<MembershipDunningState>({
      isPastDue: true,
      isInGracePeriod: true,
      isGraceExpired: false,
      daysRemaining: 3,
    });
  });

  it('marks grace expired when now is after gracePeriodEndsAt', () => {
    const now = new Date('2025-01-05T00:00:00Z');
    const gracePeriodEndsAt = new Date('2025-01-04T00:00:00Z');

    const dunning = computeDunningState({
      now,
      subscription: {
        status: 'past_due',
        gracePeriodEndsAt,
      },
    });

    expect(dunning.isPastDue).toBe(true);
    expect(dunning.isInGracePeriod).toBe(false);
    expect(dunning.isGraceExpired).toBe(true);
    expect(dunning.daysRemaining).toBe(0);
  });
});
