import { describe, expect, it } from 'vitest';

import { toMemberCardSubscription } from './membership-card-subscription';

describe('toMemberCardSubscription', () => {
  const now = new Date('2026-06-20T12:00:00.000Z');
  const currentPeriodEnd = new Date('2026-07-20T12:00:00.000Z');

  it('projects an active subscription as membership proof', () => {
    expect(
      toMemberCardSubscription(
        {
          status: 'active',
          planId: 'standard-year',
          currentPeriodEnd,
          gracePeriodEndsAt: null,
        },
        now
      )
    ).toEqual({
      kind: 'membership_proof',
      status: 'active',
      planId: 'standard-year',
      currentPeriodEnd,
      gracePeriodEndsAt: null,
    });
  });

  it('projects a past due subscription that is still in grace as membership proof', () => {
    const gracePeriodEndsAt = new Date('2026-06-27T12:00:00.000Z');

    expect(
      toMemberCardSubscription(
        {
          status: 'past_due',
          planId: 'standard-year',
          currentPeriodEnd,
          gracePeriodEndsAt,
        },
        now
      )
    ).toEqual({
      kind: 'membership_proof',
      status: 'past_due',
      planId: 'standard-year',
      currentPeriodEnd,
      gracePeriodEndsAt,
    });
  });

  it('returns null without a subscription', () => {
    expect(toMemberCardSubscription(null, now)).toBeNull();
  });

  it('strips offer price fields from raw subscription input', () => {
    const rawSubscription = {
      status: 'active',
      planId: 'standard-year',
      currentPeriodEnd,
      gracePeriodEndsAt: null,
      price: '20.00',
      tier: 'standard',
      interval: 'year',
      currency: 'EUR',
      paddlePriceId: 'pri_standard',
    };

    const proof = toMemberCardSubscription(rawSubscription, now);

    expect(proof).toEqual({
      kind: 'membership_proof',
      status: 'active',
      planId: 'standard-year',
      currentPeriodEnd,
      gracePeriodEndsAt: null,
    });
    expect(proof).not.toHaveProperty('price');
    expect(proof).not.toHaveProperty('tier');
    expect(proof).not.toHaveProperty('interval');
    expect(proof).not.toHaveProperty('currency');
    expect(proof).not.toHaveProperty('paddlePriceId');
  });
});
