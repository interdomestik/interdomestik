import { and, claims, db, eq, user } from '@interdomestik/database';

import type { ClaimsDeps, ClaimsSession } from './types';

const VALID_STATUSES = [
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
  'resolved',
  'rejected',
] as const;

function isValidStatus(value: string): value is (typeof VALID_STATUSES)[number] {
  return (VALID_STATUSES as readonly string[]).includes(value);
}

function isStaffOrAdmin(role: string | null | undefined): boolean {
  return role === 'staff' || role === 'admin';
}

export async function updateClaimStatusCore(
  params: {
    session: ClaimsSession | null;
    requestHeaders: Headers;
    claimId: string;
    newStatus: string;
  },
  deps: ClaimsDeps = {}
) {
  const { session, requestHeaders, claimId, newStatus } = params;

  if (!session || !isStaffOrAdmin(session.user.role ?? null)) {
    return { error: 'Unauthorized' };
  }

  if (!isValidStatus(newStatus)) {
    return { error: 'Invalid status' };
  }

  const tenantId = session.user.tenantId ?? 'tenant_mk';

  try {
    const claim = await db.query.claims.findFirst({
      where: (claimsTable, { and, eq }) =>
        and(eq(claimsTable.id, claimId), eq(claimsTable.tenantId, tenantId)),
    });

    if (!claim) {
      return { error: 'Claim not found' };
    }

    const oldStatus = claim.status;

    await db
      .update(claims)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));

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

    if (claim.userId && oldStatus !== newStatus && deps.notifyStatusChanged) {
      const member = await db.query.user.findFirst({
        where: (userTable, { and, eq }) =>
          and(eq(userTable.id, claim.userId), eq(userTable.tenantId, tenantId)),
      });

      if (member?.email) {
        Promise.resolve(
          deps.notifyStatusChanged(
            claim.userId,
            member.email,
            { id: claimId, title: claim.title },
            oldStatus ?? 'unknown',
            newStatus
          )
        ).catch((err: Error) => console.error('Failed to send status change notification:', err));
      }
    }

    if (deps.revalidatePath) {
      await deps.revalidatePath('/admin/claims');
      await deps.revalidatePath(`/admin/claims/${claimId}`);
      await deps.revalidatePath('/member/claims');
    }

    return { success: true };
  } catch (e) {
    console.error('Failed to update status:', e);
    return { error: 'Failed to update status' };
  }
}
