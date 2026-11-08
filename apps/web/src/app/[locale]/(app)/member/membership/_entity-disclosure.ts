import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { SponsorCoverage } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import { membershipPlans, subscriptions } from '@interdomestik/database';
import {
  toMembershipWorkspacePlan,
  type MembershipWorkspacePlan,
} from '@interdomestik/domain-membership-billing/membership-hierarchy';
import type { InferSelectModel } from 'drizzle-orm';

import {
  getSubscriptionEntityDisclosureCore,
  getSponsorEntityDisclosureCore,
  type EntityDisclosureModel,
} from '@/lib/entity-disclosure.core';

type SubscriptionWithPlan = InferSelectModel<typeof subscriptions> & {
  plan: InferSelectModel<typeof membershipPlans> | null;
};

export type SubscriptionRecord = Omit<SubscriptionWithPlan, 'plan'> & {
  plan: MembershipWorkspacePlan | null;
  entityDisclosure: EntityDisclosureModel;
  sponsorCoverage?: SponsorCoverage;
  /** A pending or future sponsored entry the member may leave before coverage starts. */
  sponsorLeaveEntryId?: string;
};

export async function attachMembershipEntityDisclosure(
  subscription: SubscriptionWithPlan,
  sponsor?: { authority: TenantAuthority; coverage: SponsorCoverage }
): Promise<SubscriptionRecord> {
  return toSubscriptionRecord(
    subscription,
    sponsor
      ? await getSponsorEntityDisclosureCore(sponsor.authority, sponsor.coverage.legalEntityId)
      : await getSubscriptionEntityDisclosureCore(subscription)
  );
}

export async function attachMembershipEntityDisclosures(
  records: SubscriptionWithPlan[]
): Promise<SubscriptionRecord[]> {
  const disclosureCache = new Map<string, Promise<EntityDisclosureModel>>();

  return Promise.all(
    records.map(async record =>
      toSubscriptionRecord(record, await getCachedEntityDisclosure(record, disclosureCache))
    )
  );
}

function toSubscriptionRecord(
  subscription: SubscriptionWithPlan,
  entityDisclosure: EntityDisclosureModel
): SubscriptionRecord {
  const { plan, ...subscriptionFields } = subscription;

  return {
    ...subscriptionFields,
    plan: toMembershipWorkspacePlan(plan),
    entityDisclosure,
  };
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
