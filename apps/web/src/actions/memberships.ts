'use server';

import { cancelSubscription, getPaymentUpdateUrl } from './subscription';

export async function getCustomerPortalUrl(subscriptionId: string) {
  return getPaymentUpdateUrl(subscriptionId);
}

export async function requestCancellation(subscriptionId: string) {
  return cancelSubscription(subscriptionId);
}
