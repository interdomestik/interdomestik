import { getPaddle } from '@/lib/paddle-server';
import { db, eq, subscriptions } from '@interdomestik/database';

import type { Session } from './context';
import type { PaymentUpdateUrlResult } from './types';

export async function getPaymentUpdateUrlCore(params: {
  session: Session | null;
  subscriptionId: string;
}): Promise<PaymentUpdateUrlResult> {
  const { session, subscriptionId } = params;

  if (!session) {
    return { error: 'Unauthorized' };
  }

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });

  if (!sub || sub.userId !== session.user.id) {
    return { error: 'Subscription not found or access denied' };
  }

  try {
    const paddle = getPaddle();
    const transaction =
      await paddle.subscriptions.getPaymentMethodChangeTransaction(subscriptionId);

    if (transaction?.checkout?.url) {
      return { url: transaction.checkout.url, error: undefined };
    }

    return { error: 'No checkout URL generated' };
  } catch (error) {
    console.error('Failed to get payment update URL:', error);
    return { error: 'Failed to generate update link' };
  }
}
