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
export type CommercialEscalationReason = 'launch_scope_supported' | 'outside_launch_scope';

export const COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORIES: ReadonlySet<string> = new Set(
  COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORY_IDS
);

export const COMMERCIAL_GUIDANCE_ONLY_CATEGORIES: ReadonlySet<string> = new Set(
  COMMERCIAL_GUIDANCE_ONLY_CATEGORY_IDS
);

export type CommercialLaunchScopeResolution = {
  claimCategory: string | null;
  decisionReason: CommercialEscalationReason;
  escalationEligible: boolean;
};

function normalizeClaimCategory(rawCategory: string | null | undefined) {
  const claimCategory = rawCategory?.trim().toLowerCase();
  return claimCategory || null;
}

export function resolveCommercialLaunchScope(
  rawCategory: string | null | undefined
): CommercialLaunchScopeResolution {
  const claimCategory = normalizeClaimCategory(rawCategory);
  const escalationEligible =
    claimCategory !== null && COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORIES.has(claimCategory);

  return {
    claimCategory,
    decisionReason: escalationEligible ? 'launch_scope_supported' : 'outside_launch_scope',
    escalationEligible,
  };
}
