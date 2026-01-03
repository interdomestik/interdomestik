import { claims, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';

function isStaff(role: string | null | undefined) {
  return role === 'staff';
}

function isStaffOrAdmin(role: string | null | undefined) {
  return role === 'staff' || role === 'admin';
}

export async function assignClaimCore(
  params: {
    claimId: string;
    staffId: string | null;
    session: ClaimsSession | null;
    requestHeaders: Headers;
  },
  deps: ClaimsDeps = {}
) {
  const { claimId, staffId, session, requestHeaders } = params;

  if (!session || !isStaffOrAdmin(session.user.role)) {
    throw new Error('Unauthorized');
  }

  const tenantId = ensureTenantId(session);

  if (isStaff(session.user.role) && staffId && staffId !== session.user.id) {
    throw new Error('Access denied');
  }

  // Get claim details
  const claim = await db.query.claims.findFirst({
    where: (claimsTable, { eq }) =>
      withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
  });

  if (!claim) throw new Error('Claim not found');

  await db
    .update(claims)
    .set({ staffId })
    .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: staffId ? 'claim.assigned' : 'claim.unassigned',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        previousStaffId: claim.staffId || null,
        newStaffId: staffId,
      },
      headers: requestHeaders,
    });
  }

  if (staffId) {
    // Get staff details for notification
    const staffMember = await db.query.user.findFirst({
      where: (userTable, { eq }) =>
        withTenant(tenantId, userTable.tenantId, eq(userTable.id, staffId)),
    });

    if (!staffMember) throw new Error('Staff member not found');

    // Notify the assigned staff member
    if (staffMember.email && deps.notifyClaimAssigned) {
      Promise.resolve(
        deps.notifyClaimAssigned(
          staffMember.id,
          staffMember.email,
          { id: claim.id, title: claim.title },
          staffMember.name || 'Staff'
        )
      ).catch(err => console.error('Failed to notify assignment:', err));
    }
  }
}
