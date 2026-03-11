export const COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORY_IDS = [
  'vehicle',
  'property',
  'injury',
] as const;

export const COMMERCIAL_GUIDANCE_ONLY_CATEGORY_IDS = ['travel'] as const;

export const COMMERCIAL_MAIN_CLAIM_CATEGORY_IDS = [
  ...COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORY_IDS,
  ...COMMERCIAL_GUIDANCE_ONLY_CATEGORY_IDS,
] as const;

export type CommercialMainClaimCategoryId = (typeof COMMERCIAL_MAIN_CLAIM_CATEGORY_IDS)[number];

export const COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORIES: ReadonlySet<string> = new Set(
  COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORY_IDS
);
