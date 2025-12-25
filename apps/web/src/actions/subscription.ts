'use server';

import { auth } from '@/lib/auth';
import { getPaddle } from '@/lib/paddle-server';
import { db, eq, subscriptions } from '@interdomestik/database';
import { headers } from 'next/headers';

export async function getPaymentUpdateUrl(subscriptionId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { error: 'Unauthorized' };
  }

  // Verify ownership
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub || sub.userId !== session.user.id) {
    return { error: 'Subscription not found or access denied' };
  }

  try {
    const paddle = getPaddle();
    // specific method to create a transaction for updating payment method
    const transaction =
      await paddle.subscriptions.getPaymentMethodChangeTransaction(subscriptionId);

    // We expect a checkout URL to redirect the user to
    // If using Overlay, we might just need the transaction ID, but for a "Link" we need URL.
    // Check if checkout.url is populated
    if (transaction?.checkout?.url) {
      return { url: transaction.checkout.url };
    }

    return { error: 'No checkout URL generated' };
  } catch (error) {
    console.error('Failed to get payment update URL:', error);
    return { error: 'Failed to generate update link' };
  }
}

export async function cancelSubscription(subscriptionId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { error: 'Unauthorized' };
  }

  // Verify ownership
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub || sub.userId !== session.user.id) {
    return { error: 'Subscription not found or access denied' };
  }

  try {
    const paddle = getPaddle();
    // Cancel at end of period to avoid prorating handling complexities for now
    await paddle.subscriptions.cancel(subscriptionId, {
      effectiveFrom: 'next_billing_period',
    });

    // We rely on webhook to update DB, but we can optimistically revalidate
    // Revalidating won't change DB status immediately until webhook arrives,
    // but typically Paddle returns the updated object.

    // For immediate UI feedback, we might want to return success message.
    return { success: true };
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    return { error: 'Failed to cancel subscription' };
  }
}
