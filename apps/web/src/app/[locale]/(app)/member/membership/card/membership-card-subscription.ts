import type { MembershipProof } from '@interdomestik/domain-membership-billing/membership-hierarchy';

export type MemberCardSubscription = MembershipProof;

export type MemberCardSubscriptionInput =
  | {
      readonly status?: string | null;
      readonly planId?: string | null;
      readonly currentPeriodEnd?: Date | null;
      readonly gracePeriodEndsAt?: Date | null;
    }
  | null
  | undefined;

export function toMemberCardSubscription(
  subscription: MemberCardSubscriptionInput,
  now = new Date()
): MemberCardSubscription | null {
  if (!subscription?.planId) return null;

  if (subscription.status === 'active') {
    return {
      kind: 'membership_proof',
      status: 'active',
      planId: subscription.planId,
      currentPeriodEnd: subscription.currentPeriodEnd ?? null,
      gracePeriodEndsAt: subscription.gracePeriodEndsAt ?? null,
    };
  }

  if (subscription.status !== 'past_due') return null;

  const gracePeriodEndsAt = subscription.gracePeriodEndsAt ?? null;
  if (!gracePeriodEndsAt || gracePeriodEndsAt.getTime() < now.getTime()) return null;

  return {
    kind: 'membership_proof',
    status: 'past_due',
    planId: subscription.planId,
    currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    gracePeriodEndsAt,
  };
}
