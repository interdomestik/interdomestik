import { db, subscriptions, user } from '@interdomestik/database';
import { eq } from 'drizzle-orm';

import type { PaddleWebhookDeps } from '../types';

export async function handleSubscriptionPastDue(
  params: { data: unknown },
  deps: Pick<PaddleWebhookDeps, 'sendPaymentFailedEmail'> = {}
) {
  const sub = params.data as unknown as {
    id: string;
    customData?: { userId?: string };
    custom_data?: { userId?: string };
    items?: Array<{ price?: { id?: string; description?: string }; priceId?: string }>;
    customerId?: string;
    customer_id?: string;
    currentBillingPeriod?: { startsAt?: string; endsAt?: string };
    current_billing_period?: { starts_at?: string; ends_at?: string };
  };
  const customData = (sub.customData || sub.custom_data) as { userId?: string } | undefined;
  const userId = customData?.userId;

  if (!userId) {
    console.warn(`[Webhook] No userId found in customData for past_due subscription ${sub.id}`);
    return;
  }

  const priceId = sub.items?.[0]?.price?.id || sub.items?.[0]?.priceId || 'unknown';
  const now = new Date();

  const gracePeriodDays = 14;
  const gracePeriodEnd = new Date(now);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);

  const existingSub = await db.query.subscriptions.findFirst({
    where: (subs, { eq: eqFn }) => eqFn(subs.id, sub.id),
  });

  const newDunningCount = (existingSub?.dunningAttemptCount || 0) + 1;

  await db
    .insert(subscriptions)
    .values({
      id: sub.id,
      userId,
      status: 'past_due',
      planId: priceId,
      providerCustomerId: sub.customerId || sub.customer_id,
      pastDueAt: existingSub?.pastDueAt || now,
      gracePeriodEndsAt: existingSub?.gracePeriodEndsAt || gracePeriodEnd,
      dunningAttemptCount: newDunningCount,
      lastDunningAt: now,
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
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.id,
      set: {
        status: 'past_due',
        planId: priceId,
        pastDueAt: existingSub?.pastDueAt || now,
        gracePeriodEndsAt: existingSub?.gracePeriodEndsAt || gracePeriodEnd,
        dunningAttemptCount: newDunningCount,
        lastDunningAt: now,
        updatedAt: now,
      },
    });

  console.log(
    `[Webhook] 🚨 DUNNING: Subscription ${sub.id} is past_due (attempt ${newDunningCount})`
  );
  console.log(`[Webhook] Grace period ends: ${gracePeriodEnd.toISOString()}`);

  if (newDunningCount === 1 && deps.sendPaymentFailedEmail) {
    try {
      const userRecord = await db.query.user.findFirst({ where: eq(user.id, userId) });

      if (userRecord?.email) {
        const planName = sub.items?.[0]?.price?.description || 'Membership';
        await deps.sendPaymentFailedEmail(userRecord.email, {
          memberName: userRecord.name || 'Member',
          planName,
          gracePeriodDays,
          gracePeriodEndDate: gracePeriodEnd.toLocaleDateString(),
        });
        console.log(`[Webhook] ✉️ Day 0 dunning email sent to ${userRecord.email}`);
      } else {
        console.warn(`[Webhook] No email found for user ${userId}`);
      }
    } catch (emailError) {
      console.error('[Webhook] Failed to send dunning email:', emailError);
    }
  }
}
