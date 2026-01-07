import { claims, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

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

  if (session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  const tenantId = ensureTenantId(session);

  try {
    const [existingClaim] = await db
      .select({ id: claims.id, staffId: claims.staffId })
      .from(claims)
      .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)))
      .limit(1);

    if (!existingClaim) {
      return { success: false, error: 'Claim not found' };
    }

    const previousStaffId = existingClaim.staffId;
    const now = new Date();
    await db
      .update(claims)
      .set({
        staffId: session.user.id,
        assignedAt: now,
        assignedById: session.user.id,
        updatedAt: now,
      })
      .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));

    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        tenantId,
        action: 'claim.assigned',
        entityType: 'claim',
        entityId: claimId,
        metadata: {
          previousStaffId,
          newStaffId: session.user.id,
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
