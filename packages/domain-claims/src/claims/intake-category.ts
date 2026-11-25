import { COMMERCIAL_MAIN_CLAIM_CATEGORY_IDS } from './commercial-launch-scope';
import { MEDICAL_CATEGORIES, normalizedClaimCategory } from './transition-evidence';

export const CANONICAL_CLAIM_CATEGORY_IDS: ReadonlySet<string> = new Set([
  ...COMMERCIAL_MAIN_CLAIM_CATEGORY_IDS,
  ...MEDICAL_CATEGORIES,
]);

export const OPEN_CLAIM_CATEGORY_IDS: ReadonlySet<string> = new Set(
  [...CANONICAL_CLAIM_CATEGORY_IDS].filter(category => !MEDICAL_CATEGORIES.has(category))
);

export function isClaimCategoryOpenForIntake(category: string | null | undefined): boolean {
  return OPEN_CLAIM_CATEGORY_IDS.has(normalizedClaimCategory(category));
}
