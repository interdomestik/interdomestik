'use server';

import { logAuditEvent } from '@/lib/audit';
import { getSponsoredMembershipState } from '@/components/ops/adapters/membership';
import { revalidatePath } from 'next/cache';
import { and, eq, subscriptions } from '@interdomestik/database';
import { createActiveAnnualMembershipFulfillment } from '@interdomestik/domain-membership-billing';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { cancelSubscriptionCore } from './subscription/cancel';
import { getActionContext } from './subscription/context';
import { getPaymentUpdateUrlCore } from './subscription/get-payment-update-url';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

const MEMBER_MEMBERSHIP_PATH = '/[locale]/(app)/member/membership';
const MEMBER_CARD_PATH = '/[locale]/(app)/member/membership/card';

export async function getPaymentUpdateUrl(subscriptionId: string) {
  const { session, authority } = await getActionContext();
  return getPaymentUpdateUrlCore({ session, authority, subscriptionId });
}

export async function cancelSubscription(subscriptionId: string, idempotencyKey?: string) {
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

export async function activateSponsoredMembership(subscriptionId: string) {
  const { session, authority } = await getActionContext();
  if (!session || !authority) {
    return { error: 'Unauthorized' as const };
  }

  const { tenantId } = readTenantAuthority(authority);

  const subscription = await withTenantAuthority(authority, async tx =>
    tx.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.userId, session.user.id),
        eq(subscriptions.tenantId, tenantId)
      ),
    })
  );

  if (!subscription) {
    return { error: 'Not found' as const };
  }

  if (getSponsoredMembershipState(subscription) !== 'activation_required') {
    return { error: 'Unsupported subscription' as const };
  }

  const currentPeriodStart = new Date();
  const activeAnnualMembershipState = createActiveAnnualMembershipFulfillment(
    subscription.planId,
    currentPeriodStart,
    subscription.planKey
  );

  await withTenantAuthority(authority, async tx =>
    tx
      .update(subscriptions)
      .set({
        ...activeAnnualMembershipState,
        updatedAt: currentPeriodStart,
      })
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)))
  );

  revalidatePath(MEMBER_MEMBERSHIP_PATH);
  revalidatePath(MEMBER_CARD_PATH);

  return { success: true as const };
}
