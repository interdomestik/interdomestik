import {
  E2E_MEMBERSHIP_LIFECYCLE_FIXTURES,
  e2eLifecycleInstant,
  type E2EMembershipLifecycleKey,
} from '@interdomestik/database';
import { describe, expect, it } from 'vitest';

import {
  getMembershipLifecycleBucket,
  membershipLifecycleGrantsAccess,
  type MembershipLifecycleBucket,
} from './subscription/lifecycle-reporting';

// The seeded E2E lifecycle states, read through the same derivation the member portal and the
// admin badge use. Expectations are written here, independently of the seed catalogue.
const EXPECTED: Record<E2EMembershipLifecycleKey, [MembershipLifecycleBucket, boolean]> = {
  TRIALING: ['trialing', true],
  PAST_DUE_IN_GRACE: ['active_in_grace', true],
  PAST_DUE_GRACE_EXPIRED: ['grace_expired', false],
  SCHEDULED_CANCEL: ['scheduled_cancel', true],
  CANCELED: ['canceled', false],
  EXPIRED: ['canceled', false],
  NO_SUBSCRIPTION: ['none', false],
};

function bucketOf(key: E2EMembershipLifecycleKey, now: Date): MembershipLifecycleBucket {
  const { subscription } = E2E_MEMBERSHIP_LIFECYCLE_FIXTURES[key];
  return getMembershipLifecycleBucket({
    now,
    subscription: subscription && {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      gracePeriodEndsAt: subscription.gracePeriodEndsAt
        ? e2eLifecycleInstant(subscription.gracePeriodEndsAt)
        : null,
    },
  });
}

describe('E2E membership lifecycle fixtures', () => {
  const keys = Object.keys(EXPECTED) as E2EMembershipLifecycleKey[];

  it('covers every named state and every lifecycle bucket', () => {
    expect(keys.sort()).toEqual(Object.keys(E2E_MEMBERSHIP_LIFECYCLE_FIXTURES).sort());
    expect(new Set(keys.map(key => EXPECTED[key][0]))).toEqual(
      new Set([
        'active_in_grace',
        'canceled',
        'grace_expired',
        'none',
        'scheduled_cancel',
        'trialing',
      ])
    );
  });

  it.each([
    ['the E2E seed base time', new Date('2026-01-01T00:00:00.000Z')],
    ['today', new Date()],
    ['a run in 2090', new Date('2090-06-01T00:00:00.000Z')],
  ])('derives the expected bucket and access at %s', (_label, now) => {
    for (const key of keys) {
      const bucket = bucketOf(key, now);
      expect([key, bucket, membershipLifecycleGrantsAccess(bucket)]).toEqual([
        key,
        ...EXPECTED[key],
      ]);
    }
  });
});
