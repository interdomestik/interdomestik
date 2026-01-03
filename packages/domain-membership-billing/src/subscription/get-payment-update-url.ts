import { and, db, eq, subscriptions } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/domain-users';
import { getPaddle } from '../paddle-server';

import type { PaymentUpdateUrlResult, SubscriptionSession } from './types';

export async function getPaymentUpdateUrlCore(params: {
  session: SubscriptionSession | null;
  subscriptionId: string;
}): Promise<PaymentUpdateUrlResult> {
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
