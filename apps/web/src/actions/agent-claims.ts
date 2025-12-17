'use server';

import { auth } from '@/lib/auth';
import { notifyClaimAssigned, notifyStatusChanged } from '@/lib/notifications';
import { claims, db, eq, user } from '@interdomestik/database';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export async function updateClaimStatus(claimId: string, newStatus: string) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || (session.user.role !== 'agent' && session.user.role !== 'admin')) {
    throw new Error('Unauthorized');
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
    .set({ status: newStatus as typeof oldStatus })
    .where(eq(claims.id, claimId));

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

  revalidatePath('/agent/claims');
  revalidatePath(`/agent/claims/${claimId}`);
  // Also revalidate user dashboard
  revalidatePath('/dashboard/claims');
  revalidatePath(`/dashboard/claims/${claimId}`);
}

export async function assignClaim(claimId: string, agentId: string) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || (session.user.role !== 'agent' && session.user.role !== 'admin')) {
    throw new Error('Unauthorized');
  }

  // Get agent details for notification
  const agent = await db.query.user.findFirst({
    where: eq(user.id, agentId),
  });

  // Get claim details
  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, claimId),
  });

  if (!claim) throw new Error('Claim not found');
  if (!agent) throw new Error('Agent not found');

  await db.update(claims).set({ agentId }).where(eq(claims.id, claimId));

  // Notify the assigned agent
  if (agent.email) {
    notifyClaimAssigned(
      agent.id,
      agent.email,
      { id: claim.id, title: claim.title },
      agent.name || 'Agent'
    ).catch(err => console.error('Failed to notify assignment:', err));
  }

  revalidatePath('/agent/claims');
  revalidatePath(`/agent/claims/${claimId}`);
}
