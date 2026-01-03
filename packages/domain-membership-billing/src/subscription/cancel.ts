import { and, db, eq, subscriptions } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { getPaddle } from '../paddle-server';

import type { CancelSubscriptionResult, SubscriptionSession } from './types';

export async function cancelSubscriptionCore(params: {
  session: SubscriptionSession | null;
  subscriptionId: string;
}): Promise<CancelSubscriptionResult> {
  const { session, subscriptionId } = params;

  if (!session) {
    return { error: 'Unauthorized' };
  }

  const tenantId = ensureTenantId(session);
  const sub = await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)),
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
