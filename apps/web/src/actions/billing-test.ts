'use server';

import { auth } from '@/lib/auth';
import { db, subscriptions } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

/**
 * DEVELOPMENT/E2E ONLY: Mock subscription activation.
 * Only works if NEXT_PUBLIC_BILLING_TEST_MODE=1 is set in environment.
 */
export async function mockActivateSubscription(planId: string, priceId: string) {
  if (process.env.NEXT_PUBLIC_BILLING_TEST_MODE !== '1') {
    throw new Error('Unauthorized: Billing test mode not enabled');
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const tenantId = ensureTenantId(session);

  // Create or update mock subscription
  await db
    .insert(subscriptions)
    .values({
      id: `mock_sub_${Date.now()}`,
      userId: session.user.id,
      tenantId,
      planId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    })
    .onConflictDoUpdate({
      target: [subscriptions.userId],
      set: {
        status: 'active',
        planId,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

  revalidatePath('/[locale]/(app)/member/membership', 'layout');
  return { success: true };
}
