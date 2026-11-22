'use server';

import { logAuditEvent } from '@/lib/audit';
import { PADDLE_CLOSED } from '@interdomestik/domain-membership-billing/paddle-closed';
import { revalidatePath } from 'next/cache';
import { cancelSubscriptionCore } from './subscription/cancel';
import { getActionContext } from './subscription/context';
import { getPaymentUpdateUrlCore } from './subscription/get-payment-update-url';
import { subscriptionClosedFailure } from './subscription/paddle-closed';

const MEMBER_MEMBERSHIP_PATH = '/[locale]/(app)/member/membership';

export async function getPaymentUpdateUrl(subscriptionId: string) {
  if (PADDLE_CLOSED) return { ...(await subscriptionClosedFailure()), url: undefined };

  const { session, authority } = await getActionContext();
  return getPaymentUpdateUrlCore({ session, authority, subscriptionId });
}

export async function cancelSubscription(subscriptionId: string, idempotencyKey?: string) {
  if (PADDLE_CLOSED) return subscriptionClosedFailure();

  const { session, authority } = await getActionContext();
  const result = await cancelSubscriptionCore(
    { session, authority, subscriptionId, idempotencyKey },
    { logAuditEvent }
  );

  if (result.success) {
    revalidatePath(MEMBER_MEMBERSHIP_PATH);
  }

  return result;
}
