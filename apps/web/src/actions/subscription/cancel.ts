import { getPaddle } from '@/lib/paddle-server';
import { db, eq, subscriptions } from '@interdomestik/database';

import type { Session } from './context';
import type { CancelSubscriptionResult } from './types';

export async function cancelSubscriptionCore(params: {
  session: Session | null;
  subscriptionId: string;
}): Promise<CancelSubscriptionResult> {
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
    await paddle.subscriptions.cancel(subscriptionId, {
      effectiveFrom: 'next_billing_period',
    });

    return { success: true, error: undefined };
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    return { error: 'Failed to cancel subscription' };
  }
}
