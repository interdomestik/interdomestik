import 'server-only';
import { createHash } from 'node:crypto';
import { claims } from '@interdomestik/database';
import { isValidClaimNumber } from '@interdomestik/database/claim-number';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
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
  authority: TenantAuthority,
  actorId: string
): Promise<ExactSavedDraftClaim> {
  const { tenantId } = readTenantAuthority(authority);
  // The recovery read owns its tenant RLS context and keeps the exact-id, tenant
  // and owner predicates; the transaction closes before the caller continues.
  const [row] = await withTenantAuthority(authority, async tx => {
    return await tx
      .select({ id: claims.id, claimNumber: claims.claimNumber })
      .from(claims)
      .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId), eq(claims.userId, actorId)))
      .limit(1);
  });
  if (!row) return { kind: 'absent' };
  if (typeof row.claimNumber !== 'string' || !isValidClaimNumber(row.claimNumber)) {
    return { kind: 'invalid' };
  }
  return { kind: 'found', claimId, claimNumber: row.claimNumber };
}
