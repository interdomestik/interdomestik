import { isValidClaimNumber } from '@interdomestik/database/claim-number';
import { withTenant } from '@interdomestik/database/tenant-security';

export interface ClaimNumberResolverResult {
  claimId: string | null;
}

/**
 * Pure core logic for resolving a claim number to an ID.
 * Validates format and checks tenant-scoped existence.
 */
export async function getClaimNumberResolverCore(params: {
  claimNumber: string;
  tenantId: string;
  db: any;
}): Promise<ClaimNumberResolverResult> {
  const { claimNumber, tenantId, db } = params;
  const normalizedNumber = decodeURIComponent(claimNumber).trim().toUpperCase();

  // 1. Validate Format
  if (!isValidClaimNumber(normalizedNumber)) {
    return { claimId: null };
  }

  // 2. Lookup Claim
  const claim = await db.query.claims.findFirst({
    where: (c: Record<string, unknown>, { eq }: any) =>
      withTenant(tenantId, c.tenantId as string, eq(c.claimNumber, normalizedNumber)),
    columns: {
      id: true,
    },
  });

  return { claimId: (claim?.id as string) || null };
}
