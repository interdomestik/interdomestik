import { db, subscriptions } from '@interdomestik/database';
import { createCommissionCore } from '../../commissions/create';
import { calculateCommission } from '../../commissions/types';
import { mapPaddleStatus } from '../subscription-status';

import type { PaddleWebhookDeps } from '../types';

const redactEmail = (email?: string | null) => {
  if (!email) return 'unknown';
  const [local, domain] = email.split('@');
  if (!domain) return 'unknown';
  const maskedLocal = local.length <= 2 ? `${local[0] ?? ''}*` : `${local[0]}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
};

export async function handleSubscriptionChanged(
  params: { eventType: string; data: unknown },
  deps: Pick<PaddleWebhookDeps, 'sendThankYouLetter'> = {}
) {
  const sub = params.data as unknown as {
    id: string;
    customData?: { userId?: string; agentId?: string };
    custom_data?: { userId?: string; agentId?: string };
    status: string;
    items?: Array<{
      price?: { id?: string; unitPrice?: { amount?: string; currencyCode?: string } };
      priceId?: string;
    }>;
    customerId?: string;
    customer_id?: string;
    currentBillingPeriod?: { startsAt?: string; endsAt?: string };
    current_billing_period?: { starts_at?: string; ends_at?: string };
    scheduledChange?: { action?: string };
    scheduled_change?: { action?: string };
  };

  const customData = (sub.customData || sub.custom_data) as
    | { userId?: string; agentId?: string }
    | undefined;
  const userId = customData?.userId;

  if (!userId) {
    console.warn(`[Webhook] No userId found in customData for subscription ${sub.id}`);
    console.warn(`[Webhook] Custom data keys:`, customData ? Object.keys(customData) : []);
    return;
  }

  const priceId = sub.items?.[0]?.price?.id || sub.items?.[0]?.priceId || 'unknown';
  const mappedStatus = mapPaddleStatus(sub.status);

  const existingSub = await db.query.subscriptions.findFirst({
    where: (subs, { eq }) => eq(subs.id, sub.id),
    columns: { tenantId: true },
  });

  const userRecord = await db.query.user.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
    columns: { tenantId: true, email: true, name: true, memberNumber: true },
  });

  const tenantId = existingSub?.tenantId ?? userRecord?.tenantId ?? 'tenant_mk';

  const baseValues = {
    status: mappedStatus,
    planId: priceId,
    providerCustomerId: sub.customerId || sub.customer_id,
    currentPeriodStart:
      sub.currentBillingPeriod?.startsAt || sub.current_billing_period?.starts_at
        ? new Date(
            sub.currentBillingPeriod?.startsAt || sub.current_billing_period?.starts_at || ''
          )
        : null,
    currentPeriodEnd:
      sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at
        ? new Date(sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at || '')
        : null,
    cancelAtPeriodEnd:
      sub.scheduledChange?.action === 'cancel' || sub.scheduled_change?.action === 'cancel',
    canceledAt: mappedStatus === 'canceled' ? new Date() : null,
    updatedAt: new Date(),
  };

  if (mappedStatus === 'active') {
    Object.assign(baseValues, {
      pastDueAt: null,
      gracePeriodEndsAt: null,
      dunningAttemptCount: 0,
      lastDunningAt: null,
    });
    console.log(`[Webhook] Subscription ${sub.id} recovered - clearing dunning fields`);
  }

  let agentBranchId: string | undefined;
  if (customData?.agentId) {
    const agent = await db.query.user.findFirst({
      where: (u, { eq }) => eq(u.id, customData.agentId!),
      columns: { branchId: true },
    });
    agentBranchId = agent?.branchId || undefined;
  }

  await db
    .insert(subscriptions)
    .values({
      id: sub.id,
      tenantId,
      userId,
      agentId: customData?.agentId,
      branchId: agentBranchId,
      ...baseValues,
    })
    .onConflictDoUpdate({
      target: subscriptions.id,
      set: {
        ...baseValues,
        agentId: customData?.agentId,
        branchId: agentBranchId,
      },
    });

  console.log(
    `[Webhook] Updated subscription ${sub.id} (status: ${mappedStatus}) for user ${userId}`
  );

  // Commission + welcome letter only for new subs.
  if (params.eventType === 'subscription.created') {
    const agentId = customData?.agentId;
    const transactionTotal = parseFloat(sub.items?.[0]?.price?.unitPrice?.amount || '0') / 100;

    if (agentId && transactionTotal > 0) {
      const agentSettings = await db.query.agentSettings?.findFirst({
        where: (settings, { and, eq }) =>
          and(eq(settings.agentId, agentId), eq(settings.tenantId, tenantId)),
      });
      const customRates = agentSettings?.commissionRates as Record<string, number> | undefined;

      const commissionAmount = calculateCommission('new_membership', transactionTotal, customRates);
      await createCommissionCore({
        agentId,
        memberId: userId,
        subscriptionId: sub.id,
        type: 'new_membership',
        amount: commissionAmount,
        currency: sub.items?.[0]?.price?.unitPrice?.currencyCode || 'EUR',
        tenantId,
        metadata: {
          planId: priceId,
          transactionTotal,
          source: 'paddle_webhook',
          customRates: !!customRates,
        },
      });
      console.log(
        `[Webhook] 💰 Commission created: €${commissionAmount} for agent ${agentId}${customRates ? ' (custom rates)' : ''}`
      );
    }

    if (deps.sendThankYouLetter) {
      // Thank-you Letter
      try {
        if (userRecord) {
          const planPrice = sub.items?.[0]?.price?.unitPrice?.amount
            ? (parseFloat(sub.items[0].price.unitPrice.amount) / 100).toFixed(2)
            : '20.00';
          const periodEnd = sub.currentBillingPeriod?.endsAt
            ? new Date(sub.currentBillingPeriod.endsAt)
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

          await deps.sendThankYouLetter({
            email: userRecord.email,
            memberName: userRecord.name,
            memberNumber: userRecord.memberNumber || `M-${userId.slice(0, 8).toUpperCase()}`,
            planName: priceId || 'Standard',
            planPrice: `€${planPrice}`,
            planInterval: 'year',
            memberSince: new Date(),
            expiresAt: periodEnd,
            locale: 'en',
          });
          console.log(`[Webhook] 📧 Thank-you Letter sent to ${redactEmail(userRecord.email)}`);
        }
      } catch (emailError) {
        console.error('[Webhook] Failed to send Thank-you Letter:', emailError);
      }
    }
  }
}
