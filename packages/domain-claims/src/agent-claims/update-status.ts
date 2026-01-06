import { claims, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ActionResult, ClaimsDeps, ClaimsSession } from '../claims/types';
import { claimStatusSchema } from '../validators/claims';

function isStaff(role: string | null | undefined) {
  return role === 'staff';
}

function isStaffOrAdmin(role: string | null | undefined) {
  return role === 'staff' || role === 'admin';
}

export async function updateClaimStatusCore(
  params: {
    claimId: string;
    newStatus: string;
    session: ClaimsSession | null;
    requestHeaders: Headers;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult> {
  const { claimId, newStatus, session, requestHeaders } = params;

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
      status: claims.status,
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

  const oldStatus = claimWithUser.status || 'draft';

  // Update status
  await db
    .update(claims)
    .set({ status: status as typeof oldStatus })
    .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      tenantId,
      action: 'claim.status_changed',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        oldStatus,
        newStatus: status,
      },
      headers: requestHeaders,
    });
  }

  // Send notification to claim owner (fire-and-forget)
  if (
    claimWithUser.userId &&
    claimWithUser.userEmail &&
    oldStatus !== status &&
    deps.notifyStatusChanged
  ) {
    Promise.resolve(
      deps.notifyStatusChanged(
        claimWithUser.userId,
        claimWithUser.userEmail,
        { id: claimWithUser.id, title: claimWithUser.title },
        oldStatus,
        status
      )
    ).catch((err: Error) => console.error('Failed to send status notification:', err));
  }

  return { success: true, error: undefined };
}
