import type { TenantTransaction } from '@interdomestik/database';
import { isValidClaimNumber } from '@interdomestik/database/claim-number';
import { and } from 'drizzle-orm';

import {
  adminClaimsBranchCondition,
  canViewAdminClaims,
  type ClaimsVisibilityContext,
} from '@/features/admin/claims/server/claimVisibility';
import { matchesAccessTenant } from '@/lib/db/access-tenant-predicate';

/** Relational-query surface of the transaction supplied by withTenantContext. */
export type ClaimNumberLookupTx = Pick<TenantTransaction, 'query'>;

/** Runs the lookup inside the caller-owned tenant context and returns its value. */
export type ClaimNumberTenantRunner = (
  lookup: (tx: ClaimNumberLookupTx) => Promise<string | null>
) => Promise<string | null>;

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
 * branch-scoped existence only through the supplied tenant transaction. An explicit row
 * access tenant always wins; only a NULL access tenant falls back to the home tenant.
 */
export async function getClaimNumberResolverCore(params: {
  claimNumber: string;
  visibility: ClaimsVisibilityContext;
  inTenantContext: ClaimNumberTenantRunner;
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

  // 3. Lookup Claim
  const branchCondition = adminClaimsBranchCondition(visibility);
  const claimId = await inTenantContext(async tx => {
    // db-access-guard: tenant-scoped -- reason: explicit access-tenant and admin branch predicates inside withTenantContext
    const claim = await tx.query.claims.findFirst({
      where: (c, { eq }) =>
        and(
          eq(c.claimNumber, normalizedNumber),
          matchesAccessTenant(c, visibility.tenantId),
          branchCondition
        ),
      columns: {
        id: true,
      },
    });
    return claim?.id ?? null;
  });

  return { claimId };
}
