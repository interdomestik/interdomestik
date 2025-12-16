'use server';

import { auth } from '@/lib/auth';
import { claims, db, eq } from '@interdomestik/database';
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
