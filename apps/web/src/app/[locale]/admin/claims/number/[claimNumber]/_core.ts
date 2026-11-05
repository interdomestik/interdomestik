import { isValidClaimNumber } from '@interdomestik/database/claim-number';

import {
  canViewAdminClaims,
  type ClaimsVisibilityContext,
} from '@/features/admin/claims/server/claimVisibility';
import type { ClaimNumberLookup } from '@/features/admin/number-resolvers/claim-number-lookup';

/** Resolves the lookup inside the caller-owned tenant context and returns the claim id. */
export type ClaimNumberTenantLookup = (lookup: ClaimNumberLookup) => Promise<string | null>;

export interface ClaimNumberResolverResult {
  claimId: string | null;
}

function normalizeClaimNumber(claimNumber: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(claimNumber);
  } catch (error) {
    // A malformed percent escape is not a claim number; anything else is unexpected.
    if (error instanceof URIError) return null;
    throw error;
  }
  return decoded.trim().toUpperCase();
}

/**
 * Core logic for resolving a claim number to an ID.
 * Validates visibility and format before any lookup, then checks access-tenant- and
 * branch-scoped existence only through the supplied tenant lookup.
 */
export async function getClaimNumberResolverCore(params: {
  claimNumber: string;
  visibility: ClaimsVisibilityContext;
  inTenantContext: ClaimNumberTenantLookup;
}): Promise<ClaimNumberResolverResult> {
  const { claimNumber, visibility, inTenantContext } = params;

  // 1. Visibility Guard (a branch manager without a branch has no scope)
  if (!canViewAdminClaims(visibility)) {
    return { claimId: null };
  }

  // 2. Validate Format
  const normalizedNumber = normalizeClaimNumber(claimNumber);
  if (!normalizedNumber || !isValidClaimNumber(normalizedNumber)) {
    return { claimId: null };
  }

  // 3. Lookup Claim (access-tenant and branch scoped, inside the caller's tenant transaction)
  const claimId = await inTenantContext({ claimNumber: normalizedNumber, visibility });

  return { claimId };
}
