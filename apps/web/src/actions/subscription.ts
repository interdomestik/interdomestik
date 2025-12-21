'use server';

import { auth } from '@/lib/auth';
import { paddle } from '@/lib/paddle-server';
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
