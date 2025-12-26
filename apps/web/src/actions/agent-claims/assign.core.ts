import { logAuditEvent } from '@/lib/audit';
import { notifyClaimAssigned } from '@/lib/notifications';
import { isStaff, isStaffOrAdmin } from '@/lib/roles';
import { claims, db, eq, user } from '@interdomestik/database';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

export async function assignClaimCore(params: {
  claimId: string;
  agentId: string | null;
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
}) {
  const { claimId, agentId, session, requestHeaders } = params;

  if (!session || !isStaffOrAdmin(session.user.role)) {
    throw new Error('Unauthorized');
  }

  if (isStaff(session.user.role) && agentId && agentId !== session.user.id) {
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
