import {
  E2E_MEMBERSHIP_LIFECYCLE_FIXTURES,
  e2eLifecycleInstant,
  type E2ELifecycleSubscription,
} from '../e2e-lifecycle-fixtures';
import { E2E_USER_IDS } from '../e2e-role-fixtures';
import { E2E_USERS } from '../e2e-users';
import { excludedSet } from '../seed-utils/excluded-set';
import { TENANTS } from './constants';
import { buildSeededMembershipCardIdentifiers } from './membership-cards';
import type { SeedGoldenContext } from './types';

const LIFECYCLE_BRANCH = 'ks_branch_a';
const LIFECYCLE_PLAN_KEY = 'golden_ks_plan_basic';
const LIFECYCLE_PLAN_TIER = 'standard';
const FIXTURES = Object.values(E2E_MEMBERSHIP_LIFECYCLE_FIXTURES);

/** One KS member per lifecycle state; no agent link, so no agent or claim list changes. */
export function buildLifecycleUsersToSeed({ at }: Pick<SeedGoldenContext, 'at'>) {
  return FIXTURES.map(fixture => ({
    id: E2E_USER_IDS[fixture.member],
    name: E2E_USERS[fixture.member].name,
    email: E2E_USERS[fixture.member].email,
    role: 'member' as const,
    tenantId: TENANTS.KS,
    branchId: LIFECYCLE_BRANCH,
    memberNumber: fixture.memberNumber,
    memberNumberIssuedAt: at(),
  }));
}

function subscriptionState(subscription: E2ELifecycleSubscription) {
  const pastDue = subscription.status === 'past_due';
  return {
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    currentPeriodStart: e2eLifecycleInstant('PAST'),
    currentPeriodEnd: e2eLifecycleInstant(subscription.currentPeriodEnd),
    gracePeriodEndsAt: subscription.gracePeriodEndsAt
      ? e2eLifecycleInstant(subscription.gracePeriodEndsAt)
      : null,
    pastDueAt: pastDue ? e2eLifecycleInstant('PAST') : null,
    canceledAt: subscription.status === 'canceled' ? e2eLifecycleInstant('PAST') : null,
    planId: LIFECYCLE_PLAN_TIER,
    planKey: LIFECYCLE_PLAN_KEY,
    branchId: LIFECYCLE_BRANCH,
    agentId: null,
  };
}

function cardState(subscription: E2ELifecycleSubscription) {
  return {
    status: subscription.card,
    expiresAt: subscription.card === 'expired' ? e2eLifecycleInstant('PAST') : null,
    revokedAt: subscription.card === 'revoked' ? e2eLifecycleInstant('PAST') : null,
  };
}

/** The exact subscription and card rows of every lifecycle state; members without one are omitted. */
export function buildLifecycleSubscriptionsToSeed() {
  return FIXTURES.flatMap(fixture => {
    const subscription: E2ELifecycleSubscription | null = fixture.subscription;
    if (!subscription) return [];
    const identifiers = buildSeededMembershipCardIdentifiers(subscription.id, TENANTS.KS);
    return [
      {
        subscription: {
          id: subscription.id,
          tenantId: TENANTS.KS,
          userId: E2E_USER_IDS[fixture.member],
          ...subscriptionState(subscription),
        },
        card: {
          id: `card_${subscription.id}`,
          tenantId: TENANTS.KS,
          subscriptionId: subscription.id,
          userId: E2E_USER_IDS[fixture.member],
          cardNumber: identifiers.cardNumber,
          qrCodeToken: identifiers.qrCodeToken,
          ...cardState(subscription),
        },
      },
    ];
  });
}

/** Upserts restore each state on every run, so a drifted row cannot survive a reseed. */
export async function seedLifecycleMemberships({ db, schema }: SeedGoldenContext) {
  console.log('💳 Seeding membership lifecycle states...');
  const rows = buildLifecycleSubscriptionsToSeed();
  const subscriptions = rows.map(row => row.subscription);
  const cards = rows.map(row => row.card);
  await db
    .insert(schema.subscriptions)
    .values(subscriptions)
    .onConflictDoUpdate({
      target: schema.subscriptions.id,
      set: excludedSet(schema.subscriptions, subscriptions[0]),
    });
  await db
    .insert(schema.membershipCards)
    .values(cards)
    .onConflictDoUpdate({
      target: schema.membershipCards.id,
      set: excludedSet(schema.membershipCards, cards[0]),
    });
}
