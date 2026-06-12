import { describe, expect, it } from 'vitest';

import { getDaysRemaining, isGracePeriodExpired } from './_core';

describe('membership dunning utilities', () => {
  it('returns 0 days remaining for null end date', () => {
    expect(getDaysRemaining({ endDate: null, now: new Date('2025-01-01T00:00:00Z') })).toBe(0);
  });

  it('does not expire a missing grace-period end date', () => {
    expect(isGracePeriodExpired({ endDate: null, now: new Date('2025-01-01T00:00:00Z') })).toBe(
      false
    );
  });
});
