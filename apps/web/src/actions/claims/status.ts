import { logAuditEvent } from '@/lib/audit';
import { notifyStatusChanged } from '@/lib/notifications';
import { isStaffOrAdmin } from '@/lib/roles';
import { claims, db, eq, user } from '@interdomestik/database';
import { revalidatePath } from 'next/cache';
import type { Session } from './context';

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

export async function updateClaimStatusCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  claimId: string;
  newStatus: string;
}) {
  const { session, requestHeaders, claimId, newStatus } = params;

  if (!session || !isStaffOrAdmin(session.user.role)) {
    return { error: 'Unauthorized' };
  }

  if (!isValidStatus(newStatus)) {
    return { error: 'Invalid status' };
  }

  try {
    const claim = await db.query.claims.findFirst({
      where: eq(claims.id, claimId),
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
      .where(eq(claims.id, claimId));

    await logAuditEvent({
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

    if (claim.userId && oldStatus !== newStatus) {
      const member = await db.query.user.findFirst({
        where: eq(user.id, claim.userId),
      });

      if (member?.email) {
        notifyStatusChanged(
          claim.userId,
          member.email,
          { id: claimId, title: claim.title },
          oldStatus ?? 'unknown',
          newStatus
        ).catch((err: Error) => console.error('Failed to send status change notification:', err));
      }
    }

    revalidatePath('/admin/claims');
    revalidatePath(`/admin/claims/${claimId}`);
    revalidatePath('/member/claims');

    return { success: true };
  } catch (e) {
    console.error('Failed to update status:', e);
    return { error: 'Failed to update status' };
  }
}
