'use server';

import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { cancelSubscriptionCore } from './subscription/cancel';
import { getActionContext } from './subscription/context';
import { getPaymentUpdateUrlCore } from './subscription/get-payment-update-url';

const MEMBER_MEMBERSHIP_PATH = '/[locale]/(app)/member/membership';

export async function getPaymentUpdateUrl(subscriptionId: string) {
  const { session, authority, failure } = await getActionContext();
  if (failure?.code === 'acceptance_required') return { error: failure.code, url: undefined };
  return getPaymentUpdateUrlCore({ session, authority, subscriptionId });
}

export async function cancelSubscription(subscriptionId: string, idempotencyKey?: string) {
  const { session, authority, failure } = await getActionContext();
  if (failure?.code === 'acceptance_required')
    return { success: false as const, error: failure.code };
  const result = await cancelSubscriptionCore(
    { session, authority, subscriptionId, idempotencyKey },
    { logAuditEvent }
  );

  if (result.success) {
    revalidatePath(MEMBER_MEMBERSHIP_PATH);
  }

  return result;
}
