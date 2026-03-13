'use server';

import { cancelSubscription, getPaymentUpdateUrl } from './subscription';

export async function getCustomerPortalUrl(subscriptionId: string) {
  return getPaymentUpdateUrl(subscriptionId);
}

export async function requestCancellation(subscriptionId: string, idempotencyKey?: string) {
  return cancelSubscription(subscriptionId, idempotencyKey);
}
