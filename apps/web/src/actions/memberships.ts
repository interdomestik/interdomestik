'use server';

import { auth } from '@/lib/auth';
import { db, subscriptions } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export async function getCustomerPortalUrl(_subscriptionId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error('Unauthorized');
  }

  // In a real implementation, this would call Stripe/Paddle API to get a portal session URL.
  // For now, we'll return a placeholder or a generic billing page.
  // We double check the user owns the subscription implicitly via context or explicit check here if needed.
  // For MVP/Safe Slice, we assume the UI passed a valid ID and we just direct them to the generic portal.

  return { url: 'https://billing.interdomestik.com/portal' };
}

export async function requestCancellation(subscriptionId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error('Unauthorized');
  }

  ensureTenantId(session);

  // Authorization: Ensure subscription belongs to user
  const subscription = await db.query.subscriptions.findFirst({
    where: (subscriptions, { eq, and }) =>
      and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, session.user.id)),
  });

  if (!subscription) {
    throw new Error('Unauthorized');
  }

  // Mark as cancel_at_period_end = true in DB
  // or insert into a requests table.
  // For this schema, let's toggle cancelAtPeriodEnd if it exists or just log it/simulate.

  // Real implementation:
  await db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: true })
    .where(eq(subscriptions.id, subscriptionId));

  revalidatePath('/[locale]/(app)/member/membership');
  return { success: true };
}
