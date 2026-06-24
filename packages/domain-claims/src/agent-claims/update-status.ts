import { claims, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ActionResult, ClaimsDeps, ClaimsSession } from '../claims/types';
import { activateClaimStatusAuditProjection } from '../claims/audit-projection';
import { transitionClaimStatus } from '../claims/transition';
import { claimStatusSchema } from '../validators/claims';

function isStaff(role: string | null | undefined) {
  return role === 'staff';
}

function isStaffOrAdmin(role: string | null | undefined) {
  return role === 'staff' || role === 'admin';
}

function transitionFailureMessage(error: string): string {
  if (error === 'claim_not_found') {
    return 'Claim not found';
  }

  if (error === 'invalid_current_status') {
    return 'Invalid current claim status';
  }

  return 'Invalid status transition';
}

export async function updateClaimStatusCore(
  params: {
    claimId: string;
    hostId?: string | null;
    newStatus: string;
    session: ClaimsSession | null;
    requestHeaders: Headers;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult> {
  const { claimId, newStatus, session } = params;

  if (!session || !isStaffOrAdmin(session.user.role)) {
    return { success: false, error: 'Unauthorized', data: undefined };
  }

  // Validate status
  const parsed = claimStatusSchema.safeParse({ status: newStatus });
  if (!parsed.success) {
    return { success: false, error: 'Invalid status', data: undefined };
  }
  const status = parsed.data.status;

  const tenantId = ensureTenantId(session);

  // Fetch claim with user info before update
  const [claimWithUser] = await db
    .select({
      id: claims.id,
      title: claims.title,
      staffId: claims.staffId,
      userId: claims.userId,
      userEmail: user.email,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));

  if (!claimWithUser) {
    return { success: false, error: 'Claim not found', data: undefined };
  }

  if (isStaff(session.user.role) && claimWithUser.staffId !== session.user.id) {
    return { success: false, error: 'Access denied', data: undefined };
  }

  const transitionResult = await transitionClaimStatus({
    actor: { id: session.user.id, role: session.user.role ?? null },
    claimId,
    hostId: params.hostId,
    tenantId,
    toStatus: status,
  });

  if (!transitionResult.success) {
    return {
      success: false,
      error: transitionFailureMessage(transitionResult.error),
      data: undefined,
    };
  }

  const oldStatus = transitionResult.fromStatus;
  const persistedStatus = transitionResult.status;

  await activateClaimStatusAuditProjection({ deps, tenantId });

  // Send notification to claim owner (fire-and-forget)
  if (
    claimWithUser.userId &&
    claimWithUser.userEmail &&
    oldStatus !== persistedStatus &&
    deps.notifyStatusChanged
  ) {
    Promise.resolve(
      deps.notifyStatusChanged(
        claimWithUser.userId,
        claimWithUser.userEmail,
        { id: claimWithUser.id, title: claimWithUser.title },
        oldStatus,
        persistedStatus
      )
    ).catch((err: Error) => console.error('Failed to send status notification:', err));
  }

  return { success: true, error: undefined };
}
