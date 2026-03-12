'use server';

import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { cancelSubscriptionCore } from './subscription/cancel';
import { getActionContext } from './subscription/context';
import { getPaymentUpdateUrlCore } from './subscription/get-payment-update-url';

const MEMBER_MEMBERSHIP_PATH = '/[locale]/(app)/member/membership';

export async function getPaymentUpdateUrl(subscriptionId: string) {
  const { session } = await getActionContext();
  return getPaymentUpdateUrlCore({ session, subscriptionId });
}

export async function cancelSubscription(subscriptionId: string) {
  const { session } = await getActionContext();
  const result = await cancelSubscriptionCore({ session, subscriptionId }, { logAuditEvent });

  if (result.success) {
    revalidatePath(MEMBER_MEMBERSHIP_PATH);
  }

  return result;
}
