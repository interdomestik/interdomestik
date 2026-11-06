import type { E2EUserKey } from './e2e-users';

/**
 * Membership lifecycle states seeded as read-only rows, one dedicated KS member per state.
 *
 * Instants are fixed calendar values, never offsets from the seed clock or the wall clock: `PAST`
 * precedes the E2E seed base time and `FAR_FUTURE` stays ahead of any test run, so each state is
 * the same on every run and on every date. Which lifecycle bucket and access each state yields is
 * asserted by the tests, not declared here.
 */
export const E2E_LIFECYCLE_INSTANTS = {
  PAST: '2025-12-01T00:00:00.000Z',
  FAR_FUTURE: '2099-12-31T00:00:00.000Z',
} as const;

type LifecycleInstant = keyof typeof E2E_LIFECYCLE_INSTANTS;

export type E2ELifecycleSubscription = {
  readonly id: string;
  readonly status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'expired';
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: LifecycleInstant;
  readonly gracePeriodEndsAt: LifecycleInstant | null;
  readonly card: 'active' | 'revoked' | 'expired';
};

export type E2EMembershipLifecycleFixture = {
  readonly member: E2EUserKey;
  readonly memberNumber: string;
  readonly subscription: E2ELifecycleSubscription | null;
};

export const E2E_MEMBERSHIP_LIFECYCLE_FIXTURES = {
  TRIALING: {
    member: 'KS_MEMBER_TRIALING',
    memberNumber: 'MEM-2026-000016',
    subscription: {
      id: 'golden_sub_ks_lifecycle_trialing',
      status: 'trialing',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: 'FAR_FUTURE',
      gracePeriodEndsAt: null,
      card: 'active',
    },
  },
  PAST_DUE_IN_GRACE: {
    member: 'KS_MEMBER_IN_GRACE',
    memberNumber: 'MEM-2026-000017',
    subscription: {
      id: 'golden_sub_ks_lifecycle_in_grace',
      status: 'past_due',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: 'PAST',
      gracePeriodEndsAt: 'FAR_FUTURE',
      card: 'active',
    },
  },
  PAST_DUE_GRACE_EXPIRED: {
    member: 'KS_MEMBER_GRACE_EXPIRED',
    memberNumber: 'MEM-2026-000018',
    subscription: {
      id: 'golden_sub_ks_lifecycle_grace_expired',
      status: 'past_due',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: 'PAST',
      gracePeriodEndsAt: 'PAST',
      card: 'active',
    },
  },
  SCHEDULED_CANCEL: {
    member: 'KS_MEMBER_SCHEDULED_CANCEL',
    memberNumber: 'MEM-2026-000019',
    subscription: {
      id: 'golden_sub_ks_lifecycle_scheduled_cancel',
      status: 'active',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: 'FAR_FUTURE',
      gracePeriodEndsAt: null,
      card: 'active',
    },
  },
  CANCELED: {
    member: 'KS_MEMBER_CANCELED',
    memberNumber: 'MEM-2026-000020',
    subscription: {
      id: 'golden_sub_ks_lifecycle_canceled',
      status: 'canceled',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: 'PAST',
      gracePeriodEndsAt: null,
      card: 'revoked',
    },
  },
  EXPIRED: {
    member: 'KS_MEMBER_EXPIRED',
    memberNumber: 'MEM-2026-000021',
    subscription: {
      id: 'golden_sub_ks_lifecycle_expired',
      status: 'expired',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: 'PAST',
      gracePeriodEndsAt: null,
      card: 'expired',
    },
  },
  NO_SUBSCRIPTION: {
    member: 'KS_MEMBER_NO_SUBSCRIPTION',
    memberNumber: 'MEM-2026-000022',
    subscription: null,
  },
} as const satisfies Record<string, E2EMembershipLifecycleFixture>;

export type E2EMembershipLifecycleKey = keyof typeof E2E_MEMBERSHIP_LIFECYCLE_FIXTURES;

export function e2eLifecycleInstant(instant: LifecycleInstant): Date {
  return new Date(E2E_LIFECYCLE_INSTANTS[instant]);
}
