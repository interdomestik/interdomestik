'use server';

import { logAuditEvent } from '@/lib/audit';
import { getSponsoredMembershipState } from '@/components/ops/adapters/membership';
import { revalidatePath } from 'next/cache';
import { and, db, eq, subscriptions } from '@interdomestik/database';
import { createActiveAnnualMembershipState } from '@interdomestik/domain-membership-billing/annual-membership';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { cancelSubscriptionCore } from './subscription/cancel';
import { getActionContext } from './subscription/context';
import { getPaymentUpdateUrlCore } from './subscription/get-payment-update-url';

const MEMBER_MEMBERSHIP_PATH = '/[locale]/(app)/member/membership';
const MEMBER_CARD_PATH = '/[locale]/(app)/member/membership/card';

export async function getPaymentUpdateUrl(subscriptionId: string) {
  const { session } = await getActionContext();
  return getPaymentUpdateUrlCore({ session, subscriptionId });
}

export async function cancelSubscription(subscriptionId: string, idempotencyKey?: string) {
  const { session } = await getActionContext();
  const result = await cancelSubscriptionCore(
    { session, subscriptionId, idempotencyKey },
    { logAuditEvent }
  );

  if (result.success) {
    revalidatePath(MEMBER_MEMBERSHIP_PATH);
  }

  return result;
}

export async function activateSponsoredMembership(subscriptionId: string) {
  const { session } = await getActionContext();
  if (!session) {
    return { error: 'Unauthorized' as const };
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return { error: 'Missing tenantId' as const };
  }

  const subscription = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.id, subscriptionId),
      eq(subscriptions.userId, session.user.id),
      eq(subscriptions.tenantId, tenantId)
    ),
  });

  if (!subscription) {
    return { error: 'Not found' as const };
  }

  if (getSponsoredMembershipState(subscription) !== 'activation_required') {
    return { error: 'Unsupported subscription' as const };
  }

  const currentPeriodStart = new Date();
  const activeAnnualMembershipState = createActiveAnnualMembershipState(currentPeriodStart);

  await db
    .update(subscriptions)
    .set({
      ...activeAnnualMembershipState,
      updatedAt: currentPeriodStart,
    })
    .where(eq(subscriptions.id, subscriptionId));

  revalidatePath(MEMBER_MEMBERSHIP_PATH);
  revalidatePath(MEMBER_CARD_PATH);

  return { success: true as const };
}
