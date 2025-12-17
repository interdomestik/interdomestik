'use server';

import { auth } from '@/lib/auth';
import { notifyClaimAssigned } from '@/lib/notifications';
import { claims, db, eq, user } from '@interdomestik/database';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export async function updateClaimStatus(claimId: string, newStatus: string) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || (session.user.role !== 'agent' && session.user.role !== 'admin')) {
    throw new Error('Unauthorized');
  }

  // Basic validation could go here
  await db
    .update(claims)
    .set({ status: newStatus as any })
    .where(eq(claims.id, claimId));

  revalidatePath('/agent/claims');
  revalidatePath(`/agent/claims/${claimId}`);
  // Also revalidate user dashboard
  revalidatePath('/dashboard/claims');
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
