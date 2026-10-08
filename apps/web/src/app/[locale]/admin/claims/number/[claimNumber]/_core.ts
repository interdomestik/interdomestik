import type { TenantTransaction } from '@interdomestik/database';
import { isValidClaimNumber } from '@interdomestik/database/claim-number';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and } from 'drizzle-orm';

import {
  adminClaimsBranchCondition,
  canViewAdminClaims,
  type ClaimsVisibilityContext,
} from '@/features/admin/claims/server/claimVisibility';

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
 * Validates visibility and format before any lookup, then checks tenant- and branch-scoped
 * existence only through the supplied tenant transaction.
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
    // db-access-guard: tenant-scoped -- reason: explicit tenant and admin branch predicates inside withTenantContext
    const claim = await tx.query.claims.findFirst({
      where: (c, { eq }) =>
        withTenant(
          visibility.tenantId,
          c.tenantId,
          and(eq(c.claimNumber, normalizedNumber), branchCondition)
        ),
      columns: {
        id: true,
      },
    });
    return claim?.id ?? null;
  });

  return { claimId };
}
