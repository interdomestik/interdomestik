import type { TenantTransaction } from '@interdomestik/database';
import { and } from 'drizzle-orm';

import {
  adminClaimsBranchCondition,
  type ClaimsVisibilityContext,
} from '@/features/admin/claims/server/claimVisibility';
import { matchesAccessTenant } from '@/lib/db/access-tenant-predicate';

/** A validated, normalized claim number and the visibility it is resolved under. */
export type ClaimNumberLookup = Readonly<{
  claimNumber: string;
  visibility: ClaimsVisibilityContext;
}>;

/**
 * Finds the claim id for a claim number through the borrowed tenant transaction. An explicit row
 * access tenant always wins; only a NULL access tenant falls back to the home tenant.
 */
export async function findClaimIdByNumber(
  tx: Pick<TenantTransaction, 'query'>,
  lookup: ClaimNumberLookup
): Promise<string | null> {
  const branchCondition = adminClaimsBranchCondition(lookup.visibility);
  // db-access-guard: tenant-scoped -- reason: explicit access-tenant and admin branch predicates inside withTenantAuthority
  const claim = await tx.query.claims.findFirst({
    where: (c, { eq }) =>
      and(
        eq(c.claimNumber, lookup.claimNumber),
        matchesAccessTenant(c, lookup.visibility.tenantId),
        branchCondition
      ),
    columns: {
      id: true,
    },
  });
  return claim?.id ?? null;
}
