import { membershipPlans, subscriptions } from '@interdomestik/database';
import type { InferSelectModel } from 'drizzle-orm';

import {
  getSubscriptionEntityDisclosureCore,
  type EntityDisclosureModel,
} from '@/lib/entity-disclosure.core';

type SubscriptionWithPlan = InferSelectModel<typeof subscriptions> & {
  plan: InferSelectModel<typeof membershipPlans> | null;
};

export type SubscriptionRecord = SubscriptionWithPlan & {
  entityDisclosure: EntityDisclosureModel;
};

export async function attachMembershipEntityDisclosure(
  subscription: SubscriptionWithPlan
): Promise<SubscriptionRecord> {
  return {
    ...subscription,
    entityDisclosure: await getSubscriptionEntityDisclosureCore(subscription),
  };
}

export async function attachMembershipEntityDisclosures(
  records: SubscriptionWithPlan[]
): Promise<SubscriptionRecord[]> {
  const disclosureCache = new Map<string, Promise<EntityDisclosureModel>>();

  return Promise.all(
    records.map(async record => ({
      ...record,
      entityDisclosure: await getCachedEntityDisclosure(record, disclosureCache),
    }))
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
