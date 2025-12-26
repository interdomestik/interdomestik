import { logAuditEvent } from '@/lib/audit';
import { notifyStatusChanged } from '@/lib/notifications';
import { isStaff, isStaffOrAdmin } from '@/lib/roles';
import { claims, db, eq, user } from '@interdomestik/database';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

export async function updateClaimStatusCore(params: {
  claimId: string;
  newStatus: string;
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
}) {
  const { claimId, newStatus, session, requestHeaders } = params;

  if (!session || !isStaffOrAdmin(session.user.role)) {
    throw new Error('Unauthorized');
  }

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
    .where(eq(claims.id, claimId));

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

  // Send notification to claim owner (fire-and-forget)
  if (claimWithUser.userId && claimWithUser.userEmail && oldStatus !== newStatus) {
    try {
      notifyStatusChanged(
        claimWithUser.userId,
        claimWithUser.userEmail,
        { id: claimWithUser.id, title: claimWithUser.title },
        oldStatus,
        newStatus
      ).catch((err: Error) => console.error('Failed to send status notification:', err));
    } catch (err) {
      console.error('Failed to initiate status notification:', err);
    }
  }

  revalidatePath('/member/claims');
  revalidatePath(`/member/claims/${claimId}`);
  revalidatePath('/staff/claims');
  revalidatePath(`/staff/claims/${claimId}`);
  // Also revalidate user dashboard
  revalidatePath('/member/claims');
  revalidatePath(`/member/claims/${claimId}`);
}
