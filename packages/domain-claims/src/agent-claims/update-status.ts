import { and, claims, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';

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
) {
  const { claimId, newStatus, session, requestHeaders } = params;

  if (!session || !isStaffOrAdmin(session.user.role)) {
    throw new Error('Unauthorized');
  }

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
    throw new Error('Claim not found');
  }

  if (isStaff(session.user.role) && claimWithUser.staffId !== session.user.id) {
    throw new Error('Access denied');
  }

  const oldStatus = claimWithUser.status || 'draft';

  // Update status
  await db
    .update(claims)
    .set({ status: newStatus as typeof oldStatus })
    .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: 'claim.status_changed',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        oldStatus,
        newStatus,
      },
      headers: requestHeaders,
    });
  }

  // Send notification to claim owner (fire-and-forget)
  if (
    claimWithUser.userId &&
    claimWithUser.userEmail &&
    oldStatus !== newStatus &&
    deps.notifyStatusChanged
  ) {
    Promise.resolve(
      deps.notifyStatusChanged(
        claimWithUser.userId,
        claimWithUser.userEmail,
        { id: claimWithUser.id, title: claimWithUser.title },
        oldStatus,
        newStatus
      )
    ).catch((err: Error) => console.error('Failed to send status notification:', err));
  }
}
