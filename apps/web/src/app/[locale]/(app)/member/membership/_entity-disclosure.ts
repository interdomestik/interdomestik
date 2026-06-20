import { membershipPlans, subscriptions } from '@interdomestik/database';
import {
  toMembershipWorkspacePlan,
  type MembershipWorkspacePlan,
} from '@interdomestik/domain-membership-billing/membership-hierarchy';
import type { InferSelectModel } from 'drizzle-orm';

import {
  getSubscriptionEntityDisclosureCore,
  type EntityDisclosureModel,
} from '@/lib/entity-disclosure.core';

type SubscriptionWithPlan = InferSelectModel<typeof subscriptions> & {
  plan: InferSelectModel<typeof membershipPlans> | null;
};

export type SubscriptionRecord = Omit<SubscriptionWithPlan, 'plan'> & {
  plan: MembershipWorkspacePlan | null;
  entityDisclosure: EntityDisclosureModel;
};

export async function attachMembershipEntityDisclosure(
  subscription: SubscriptionWithPlan
): Promise<SubscriptionRecord> {
  const { plan, ...subscriptionFields } = subscription;

  return {
    ...subscriptionFields,
    plan: toMembershipWorkspacePlan(plan),
    entityDisclosure: await getSubscriptionEntityDisclosureCore(subscription),
  };
}

export async function attachMembershipEntityDisclosures(
  records: SubscriptionWithPlan[]
): Promise<SubscriptionRecord[]> {
  const disclosureCache = new Map<string, Promise<EntityDisclosureModel>>();

  return Promise.all(
    records.map(async record => {
      const { plan, ...subscriptionFields } = record;

      return {
        ...subscriptionFields,
        plan: toMembershipWorkspacePlan(plan),
        entityDisclosure: await getCachedEntityDisclosure(record, disclosureCache),
      };
    })
  );
}

function getCachedEntityDisclosure(
  subscription: SubscriptionWithPlan,
  disclosureCache: Map<string, Promise<EntityDisclosureModel>>
): Promise<EntityDisclosureModel> {
  const cacheKey = [
    subscription.legalTenantId ?? subscription.tenantId ?? '',
    subscription.governingLawSnapshot ?? '',
  ].join(':');
  const cachedDisclosure = disclosureCache.get(cacheKey);

  if (cachedDisclosure) {
    return cachedDisclosure;
  }

  const disclosure = getSubscriptionEntityDisclosureCore(subscription);
  disclosureCache.set(cacheKey, disclosure);
  return disclosure;
}
