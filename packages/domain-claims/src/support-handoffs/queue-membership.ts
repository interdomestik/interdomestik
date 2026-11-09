import type {
  EffectiveMembership,
  SubscriptionRow,
} from '@interdomestik/domain-membership-billing/sponsor-coverage';

export function queueMembership(membership: EffectiveMembership<SubscriptionRow>) {
  if (membership.source === 'sponsor') {
    return { planKey: membership.planKey, ...membership.lifecycle };
  }
  return membership.source === 'subscription' ? membership.subscription : null;
}
