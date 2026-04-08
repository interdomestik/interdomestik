import { db, eq, subscriptions } from '@interdomestik/database';
import { findSubscriptionByProviderReference } from '../../subscription';

import { subscriptionEventDataSchema } from '../schemas';
import type { PaddleWebhookAuditDeps, PaddleWebhookDeps } from '../types';

const redactEmail = (email?: string | null) => {
  if (!email) return 'unknown';
  const [local, domain] = email.split('@');
  if (!domain) return 'unknown';
  const maskedLocal = local.length <= 2 ? `${local[0] ?? ''}*` : `${local[0]}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
};

export async function handleSubscriptionPastDue(
  params: { data: unknown },
  deps: Pick<PaddleWebhookDeps, 'sendPaymentFailedEmail'> & PaddleWebhookAuditDeps = {}
) {
  const parseResult = subscriptionEventDataSchema.safeParse(params.data);
  if (!parseResult.success) {
    console.error('[Webhook] Invalid dunning data:', parseResult.error);
    return;
  }
  const sub = parseResult.data;

  const customData = sub.customData || sub.custom_data;
  const userId = customData?.userId;

  if (!userId) {
    console.warn(`[Webhook] No userId found in customData for past_due subscription ${sub.id}`);
    return;
  }

  // Get User Tenant
  const userRecord = await db.query.user.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
    columns: { id: true, email: true, name: true, tenantId: true },
  });

  if (!userRecord) {
    console.warn(`[Webhook] User not found: ${userId}`);
    return;
  }

  // Get existing subscription to increment counters
  const existingSub =
    (await findSubscriptionByProviderReference(sub.id)) ??
    (await db.query.subscriptions.findFirst({
      where: (subs, { eq }) => eq(subs.userId, userId),
    }));

  const now = new Date();
  const gracePeriodDays = 14;
  const gracePeriodEnd = new Date(now);
  gracePeriodEnd.setDate(now.getDate() + gracePeriodDays);
  const newDunningCount = (existingSub?.dunningAttemptCount || 0) + 1;
  const priceId = sub.items?.[0]?.price?.id || sub.items?.[0]?.priceId || 'unknown';

  const values = {
    tenantId: userRecord.tenantId,
    userId,
    status: 'past_due' as const,
    planId: priceId,
    providerSubscriptionId: sub.id,
    providerCustomerId: sub.customerId || sub.customer_id,
    pastDueAt: existingSub?.pastDueAt || now,
    gracePeriodEndsAt: existingSub?.gracePeriodEndsAt || gracePeriodEnd,
    dunningAttemptCount: newDunningCount,
    lastDunningAt: now,
    currentPeriodStart:
      sub.currentBillingPeriod?.startsAt || sub.current_billing_period?.starts_at
        ? new Date(
            sub.currentBillingPeriod?.startsAt || (sub.current_billing_period?.starts_at as string)
          )
        : null,
    currentPeriodEnd:
      sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at
        ? new Date(
            sub.currentBillingPeriod?.endsAt || (sub.current_billing_period?.ends_at as string)
          )
        : null,
    updatedAt: now,
  };

  if (existingSub) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.id, existingSub.id));
  } else {
    try {
      await db.insert(subscriptions).values({
        id: sub.id,
        ...values,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const racedSubscription =
        (await findSubscriptionByProviderReference(sub.id)) ??
        (await db.query.subscriptions.findFirst({
          where: (subs, { eq }) => eq(subs.userId, userId),
        }));

      if (!racedSubscription) {
        throw error;
      }

      await db.update(subscriptions).set(values).where(eq(subscriptions.id, racedSubscription.id));
    }
  }

  console.log(
    `[Webhook] 🚨 DUNNING: Subscription ${sub.id} is past_due (attempt ${newDunningCount})`
  );
  console.log(`[Webhook] Grace period ends: ${gracePeriodEnd.toISOString()}`);

  // 🔒 SECURITY Audit Log
  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'subscription.past_due',
      entityType: 'subscription',
      entityId: sub.id,
      tenantId: userRecord.tenantId,
      metadata: {
        dunningAttempt: newDunningCount,
        gracePeriodEnd: gracePeriodEnd.toISOString(),
      },
    });
  }

  if (newDunningCount === 1 && deps.sendPaymentFailedEmail) {
    try {
      if (userRecord?.email) {
        const planName = sub.items?.[0]?.price?.description || 'Membership';
        await deps.sendPaymentFailedEmail(userRecord.email, {
          memberName: userRecord.name || 'Member',
          planName,
          gracePeriodDays,
          gracePeriodEndDate: gracePeriodEnd.toLocaleDateString(),
        });
        console.log(`[Webhook] ✉️ Day 0 dunning email sent to ${redactEmail(userRecord.email)}`);
      } else {
        console.warn(`[Webhook] No email found for user ${userId}`);
      }
    } catch (emailError) {
      console.error('[Webhook] Failed to send dunning email:', emailError);
    }
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === '23505'
  );
}
