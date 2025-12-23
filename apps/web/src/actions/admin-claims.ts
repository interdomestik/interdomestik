'use server';

import { auth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { notifyStatusChanged } from '@/lib/notifications';
import { claims, db, user } from '@interdomestik/database';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'verification'
  | 'evaluation'
  | 'negotiation'
  | 'court'
  | 'resolved'
  | 'rejected';

export async function updateClaimStatus(formData: FormData) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  const claimId = formData.get('claimId') as string;
  const newStatus = formData.get('status') as ClaimStatus;
  const locale = formData.get('locale') as string;

  if (!claimId || !newStatus) {
    throw new Error('Missing required fields');
  }

  // Validate status value
  const validStatuses: ClaimStatus[] = [
    'draft',
    'submitted',
    'verification',
    'evaluation',
    'negotiation',
    'court',
    'resolved',
    'rejected',
  ];

  if (!validStatuses.includes(newStatus)) {
    throw new Error('Invalid status');
  }

  // Fetch claim with user info before update
  const [claimWithUser] = await db
    .select({
      id: claims.id,
      title: claims.title,
      status: claims.status,
      userId: claims.userId,
      userEmail: user.email,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .where(eq(claims.id, claimId));

  if (!claimWithUser) {
    throw new Error('Claim not found');
  }

  const oldStatus = claimWithUser.status || 'draft';

  // Update status
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

  revalidatePath(`/${locale}/admin/claims`);
  revalidatePath(`/${locale}/admin/claims/${claimId}`);
  revalidatePath(`/${locale}/member/claims/${claimId}`);

  redirect(`/${locale}/admin/claims/${claimId}`);
}
