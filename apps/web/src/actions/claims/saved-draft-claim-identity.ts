import 'server-only';
import { createHash } from 'node:crypto';
import { claims, db } from '@interdomestik/database';
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
  // db-access-guard: tenant-scoped -- reason: RLS enabled, not enforced for this runtime role; exact-id, tenant and owner predicates are mandatory.
  const [row] = await db
    .select({ id: claims.id, claimNumber: claims.claimNumber })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId), eq(claims.userId, actorId)))
    .limit(1);
  if (!row) return { kind: 'absent' };
  if (typeof row.claimNumber !== 'string' || !isValidClaimNumber(row.claimNumber)) {
    return { kind: 'invalid' };
  }
  return { kind: 'found', claimId, claimNumber: row.claimNumber };
}
