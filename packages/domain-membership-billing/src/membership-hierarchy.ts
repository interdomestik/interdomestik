export type MembershipPriceInterval = 'month' | 'year';
export type MembershipTier = 'standard' | 'family' | 'business' | (string & {});

type OfferPricingFieldsExcluded = {
  readonly currency?: never;
  readonly interval?: never;
  readonly paddlePriceId?: never;
  readonly price?: never;
  readonly tier?: never;
};

export type MembershipOffer = {
  readonly kind: 'membership_offer';
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly interval: MembershipPriceInterval;
  readonly price: string;
  readonly tier: MembershipTier;
  readonly paddlePriceId: string | null;
};

export type MembershipProof = OfferPricingFieldsExcluded & {
  readonly kind: 'membership_proof';
  readonly status: 'active' | 'past_due';
  readonly planId: string;
  readonly currentPeriodEnd: Date | null;
  readonly gracePeriodEndsAt: Date | null;
};

export type MembershipWorkspacePlan = OfferPricingFieldsExcluded & {
  readonly kind: 'membership_workspace_plan';
  readonly id: string;
  readonly name: string;
};

export type MembershipWorkspacePlanSource =
  | {
      readonly id: string;
      readonly name: string;
    }
  | null
  | undefined;

export function toMembershipWorkspacePlan(
  plan: MembershipWorkspacePlanSource
): MembershipWorkspacePlan | null {
  if (!plan) return null;

  return {
    kind: 'membership_workspace_plan',
    id: plan.id,
    name: plan.name,
  };
}
