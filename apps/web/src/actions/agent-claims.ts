'use server';

import { auth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { notifyClaimAssigned, notifyStatusChanged } from '@/lib/notifications';
import { claims, db, eq, user } from '@interdomestik/database';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export async function updateClaimStatus(claimId: string, newStatus: string) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session || (session.user.role !== 'staff' && session.user.role !== 'admin')) {
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

  if (session.user.role === 'staff' && claimWithUser.staffId !== session.user.id) {
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
    notifyStatusChanged(
      claimWithUser.userId,
      claimWithUser.userEmail,
      { id: claimWithUser.id, title: claimWithUser.title },
      oldStatus,
      newStatus
    ).catch((err: Error) => console.error('Failed to send status notification:', err));
  }

  revalidatePath('/member/claims');
  revalidatePath(`/member/claims/${claimId}`);
  revalidatePath('/staff/claims');
  revalidatePath(`/staff/claims/${claimId}`);
  // Also revalidate user dashboard
  revalidatePath('/member/claims');
  revalidatePath(`/member/claims/${claimId}`);
}

export async function assignClaim(claimId: string, agentId: string | null) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session || (session.user.role !== 'staff' && session.user.role !== 'admin')) {
    throw new Error('Unauthorized');
  }

  if (session.user.role === 'staff' && agentId && agentId !== session.user.id) {
    throw new Error('Access denied');
  }

  // Get claim details
  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, claimId),
  });

  if (!claim) throw new Error('Claim not found');

  await db.update(claims).set({ staffId: agentId }).where(eq(claims.id, claimId));

  await logAuditEvent({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: agentId ? 'claim.assigned' : 'claim.unassigned',
    entityType: 'claim',
    entityId: claimId,
    metadata: {
      previousStaffId: claim.staffId || null,
      newStaffId: agentId,
    },
    headers: requestHeaders,
  });

  if (agentId) {
    // Get staff details for notification
    const staffMember = await db.query.user.findFirst({
      where: eq(user.id, agentId),
    });

    if (!staffMember) throw new Error('Staff member not found');

    // Notify the assigned staff member
    if (staffMember.email) {
      notifyClaimAssigned(
        staffMember.id,
        staffMember.email,
        { id: claim.id, title: claim.title },
        staffMember.name || 'Staff'
      ).catch(err => console.error('Failed to notify assignment:', err));
    }
  }

  revalidatePath('/member/claims');
  revalidatePath(`/member/claims/${claimId}`);
  revalidatePath('/admin/claims');
  revalidatePath(`/admin/claims/${claimId}`);
  revalidatePath('/staff/claims');
  revalidatePath(`/staff/claims/${claimId}`);
}
