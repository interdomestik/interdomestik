import type { ClaimStatus } from '@interdomestik/database/constants';
import {
  ALLOWED_CLAIM_STATUS_TRANSITIONS,
  isClaimStatusTransitionInGraph,
} from '@interdomestik/domain-claims/claims/transition-guard';

/**
 * Compatibility export for admin claim UI callers.
 * The graph itself is owned by the domain transition authority.
 */
export const ALLOWED_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> =
  ALLOWED_CLAIM_STATUS_TRANSITIONS;

/**
 * Checks if a transition is valid.
 */
export function isTransitionAllowed(from: ClaimStatus, to: ClaimStatus): boolean {
  return isClaimStatusTransitionInGraph(from, to);
}
