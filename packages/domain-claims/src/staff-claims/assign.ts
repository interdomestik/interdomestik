import { and, claims, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { isNull } from 'drizzle-orm';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import type { ActionResult } from './types';

/** Assign a claim to the current staff member */
export async function assignClaimCore(
  params: {
    claimId: string;
    session: ClaimsSession | null;
    requestHeaders?: Headers;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult> {
  const { claimId, session, requestHeaders } = params;
  type StaffUser = ClaimsSession['user'] & { branchId?: string | null };

  if (session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  const tenantId = ensureTenantId(session);
  const user = session.user as StaffUser;
  const branchId = user.branchId ?? null;
  const readScope =
    branchId != null
      ? and(eq(claims.id, claimId), eq(claims.branchId, branchId))
      : and(eq(claims.id, claimId), eq(claims.staffId, user.id));
  const scopedWhere = withTenant(tenantId, claims.tenantId, readScope);

  try {
    const [existingClaim] = await db
      .select({ id: claims.id, staffId: claims.staffId, branchId: claims.branchId })
      .from(claims)
      .where(scopedWhere)
      .limit(1);

    if (!existingClaim) {
      return { success: false, error: 'Claim not found or access denied' };
    }

    if (existingClaim.staffId === user.id) {
      return { success: true };
    }

    if (existingClaim.staffId && existingClaim.staffId !== user.id) {
      return { success: false, error: 'Claim is already assigned to another staff member' };
    }

    const previousStaffId = existingClaim.staffId;
    const now = new Date();
    const updatedClaims = await db
      .update(claims)
      .set({
        staffId: session.user.id,
        assignedAt: now,
        assignedById: user.id,
        updatedAt: now,
      })
      .where(and(scopedWhere, isNull(claims.staffId)))
      .returning({ id: claims.id });

    if (updatedClaims.length === 0) {
      return { success: false, error: 'Claim not found or access denied' };
    }

    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        tenantId,
        action: 'claim.assigned',
        entityType: 'claim',
        entityId: claimId,
        metadata: {
          previousStaffId,
          newStaffId: user.id,
        },
        headers: requestHeaders,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to assign claim:', error);
    return { success: false, error: 'Failed to assign claim' };
  }
}
