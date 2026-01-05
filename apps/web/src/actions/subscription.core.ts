'use server';

import { logAuditEvent } from '@/lib/audit';
import { cancelSubscriptionCore } from './subscription/cancel';
import { getActionContext } from './subscription/context';
import { getPaymentUpdateUrlCore } from './subscription/get-payment-update-url';

export async function getPaymentUpdateUrl(subscriptionId: string) {
  const { session } = await getActionContext();
  return getPaymentUpdateUrlCore({ session, subscriptionId });
}

export async function cancelSubscription(subscriptionId: string) {
  const { session } = await getActionContext();
  return cancelSubscriptionCore({ session, subscriptionId }, { logAuditEvent });
}
