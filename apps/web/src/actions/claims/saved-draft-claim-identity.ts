import 'server-only';
import { createHash } from 'node:crypto';
import { claims, withTenantContext } from '@interdomestik/database';
import { isValidClaimNumber } from '@interdomestik/database/claim-number';
import { and, eq } from 'drizzle-orm';

export type ExactSavedDraftClaim =
  { kind: 'absent' | 'invalid' } | { kind: 'found'; claimId: string; claimNumber: string };

export function savedDraftClaimId(tenantId: string, actorId: string, draftId: string) {
  const digest = createHash('sha256')
    .update(JSON.stringify([tenantId, actorId, draftId.toLowerCase()]))
    .digest('hex');
  return `fsd_${digest}`;
}

export async function readSavedDraftClaim(
  claimId: string,
  tenantId: string,
  actorId: string
): Promise<ExactSavedDraftClaim> {
  // The recovery read owns its tenant RLS context and keeps the exact-id, tenant
  // and owner predicates; the transaction closes before the caller continues.
  const [row] = await withTenantContext(
    { tenantId },
    async tx =>
      await tx
        .select({ id: claims.id, claimNumber: claims.claimNumber })
        .from(claims)
        .where(
          and(eq(claims.id, claimId), eq(claims.tenantId, tenantId), eq(claims.userId, actorId))
        )
        .limit(1)
  );
  if (!row) return { kind: 'absent' };
  if (typeof row.claimNumber !== 'string' || !isValidClaimNumber(row.claimNumber)) {
    return { kind: 'invalid' };
  }
  return { kind: 'found', claimId, claimNumber: row.claimNumber };
}
