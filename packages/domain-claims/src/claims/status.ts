import { claims, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

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

import { claimStatusSchema } from '../validators/claims';

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

  const parsed = claimStatusSchema.safeParse({ status: newStatus });
  if (!parsed.success) {
    return { error: 'Invalid status' };
  }

  // validated by safeParse above
  const { status } = parsed.data;

  const tenantId = ensureTenantId(session);

  try {
    const claim = await db.query.claims.findFirst({
      where: (claimsTable, { eq }) =>
        withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
    });

    if (!claim) {
      return { error: 'Claim not found' };
    }

    const oldStatus = claim.status;

    await db
      .update(claims)
      .set({
        status,
        updatedAt: new Date(),
      })
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
          newStatus,
        },
        headers: requestHeaders,
      });
    }

    if (claim.userId && oldStatus !== newStatus && deps.notifyStatusChanged) {
      const member = await db.query.user.findFirst({
        where: (userTable, { eq }) =>
          withTenant(tenantId, userTable.tenantId, eq(userTable.id, claim.userId)),
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
