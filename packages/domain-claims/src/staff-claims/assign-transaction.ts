import { and, auditLog, claims, eq, type TenantTransaction } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { buildStaffClaimReadScope } from './scope';
import type { ActionResult } from './types';

/** The caller supplies its tenant transaction; audit failure must roll back the CAS write. */
export async function assignClaimInTransaction(
  tx: TenantTransaction,
  params: {
    authority: TenantAuthority;
    branchId: string | null;
    claimId: string;
    userId: string;
    actorRole?: string | null;
    nextStaffId: string | null;
    previousStaffId: string | null;
    requestHeaders?: Headers;
  }
): Promise<ActionResult> {
  const { authority, nextStaffId, previousStaffId, requestHeaders, ...scope } = params;
  const { tenantId } = readTenantAuthority(authority);
  const now = new Date();
  const scopedWhere = withTenant(tenantId, claims.tenantId, buildStaffClaimReadScope(scope));
  const guard = previousStaffId ? eq(claims.staffId, previousStaffId) : isNull(claims.staffId);
  // db-access-guard: tenant-scoped -- reason: tenant predicate built by scopedWhere and consumed by this DB call
  const updated = await tx
    .update(claims)
    .set({
      staffId: nextStaffId,
      assignedAt: nextStaffId ? now : null,
      assignedById: nextStaffId ? scope.userId : null,
      updatedAt: now,
    })
    .where(and(scopedWhere, guard))
    .returning({ id: claims.id });

  if (updated.length === 0) return { success: false, error: 'Claim not found or access denied' };

  const requestMetadata = requestHeaders
    ? {
        ip:
          requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          requestHeaders.get('x-real-ip') ||
          undefined,
        userAgent: requestHeaders.get('user-agent') || undefined,
      }
    : {};
  // db-access-guard: tenant-scoped -- reason: tenantId is read from the caller's validated authority
  await tx.insert(auditLog).values({
    id: nanoid(),
    tenantId,
    actorId: scope.userId || null,
    actorRole: scope.actorRole || null,
    action: nextStaffId ? 'claim.assigned' : 'claim.unassigned',
    entityType: 'claim',
    entityId: scope.claimId || null,
    metadata: { previousStaffId, newStaffId: nextStaffId, ...requestMetadata },
    createdAt: new Date(),
  });
  return { success: true };
}
