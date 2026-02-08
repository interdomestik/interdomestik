import { claims, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ActionResult, ClaimsDeps, ClaimsSession } from '../claims/types';
import { assignClaimSchema } from '../validators/claims';

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
): Promise<ActionResult> {
  const { claimId, staffId, session, requestHeaders } = params;

  if (!session || !isStaffOrAdmin(session.user.role)) {
    return { success: false, error: 'Unauthorized', data: undefined };
  }

  // Validate inputs
  const parsed = assignClaimSchema.safeParse({ staffId });
  if (!parsed.success) {
    return { success: false, error: 'Invalid staff assignment', data: undefined };
  }

  const tenantId = ensureTenantId(session);

  if (isStaff(session.user.role) && staffId && staffId !== session.user.id) {
    return { success: false, error: 'Access denied: Cannot assign other staff', data: undefined };
  }

  // Get claim details
  const claim = await db.query.claims.findFirst({
    where: (claimsTable, { eq }) =>
      withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
  });

  if (!claim) return { success: false, error: 'Claim not found', data: undefined };

  let staffMember:
    | {
        id: string;
        email: string | null;
        name: string | null;
      }
    | null
    | undefined;
  if (staffId) {
    // Validate assignee before mutating the claim to ensure fail-closed behavior.
    staffMember = await db.query.user.findFirst({
      where: (userTable, { eq }) =>
        withTenant(tenantId, userTable.tenantId, eq(userTable.id, staffId)),
    });

    if (!staffMember) return { success: false, error: 'Staff member not found', data: undefined };
  }

  await db
    .update(claims)
    .set({ staffId })
    .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      tenantId,
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

  if (staffId && staffMember) {
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

  return { success: true, error: undefined };
}
