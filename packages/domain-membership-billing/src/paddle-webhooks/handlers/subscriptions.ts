import { db, subscriptions } from '@interdomestik/database';
import { subscriptionEventDataSchema } from '../schemas';
import { mapPaddleStatus, type InternalSubscriptionStatus } from '../subscription-status';

import type { PaddleWebhookAuditDeps, PaddleWebhookDeps } from '../types';
import { resolveSubscriptionContext } from './utils/context';
import { handleNewSubscriptionExtras } from './utils/extras';

export async function handleSubscriptionChanged(
  params: { eventType: string; data: unknown },
  deps: Pick<PaddleWebhookDeps, 'sendThankYouLetter'> & PaddleWebhookAuditDeps = {}
) {
  const parseResult = subscriptionEventDataSchema.safeParse(params.data);
  if (!parseResult.success) {
    console.error('[Webhook] Invalid subscription data:', parseResult.error);
    return;
  }
  const sub = parseResult.data;

  // 1. Resolve Context (User, Tenant, Branch)
  const context = await resolveSubscriptionContext(sub);
  if (!context) return;

  const { userId, tenantId, branchId, customData, userRecord } = context;

  const priceId = sub.items?.[0]?.price?.id || sub.items?.[0]?.priceId || 'unknown';
  const mappedStatus = mapPaddleStatus(sub.status);

  // 2. Upsert Subscription
  await upsertSubscription({
    sub,
    tenantId,
    userId,
    agentId: customData?.agentId,
    branchId,
    mappedStatus,
    priceId,
  });

  // 3. Audit Log
  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'subscription.updated',
      entityType: 'subscription',
      entityId: sub.id,
      tenantId,
      metadata: {
        eventType: params.eventType,
        status: mappedStatus,
        paddleStatus: sub.status,
        userId,
      },
    });
  }

  console.log(
    `[Webhook] Updated subscription ${sub.id} (status: ${mappedStatus}) for user ${userId}`
  );

  // 4. Extras (Commission + Email) for new subscriptions
  if (params.eventType === 'subscription.created') {
    await handleNewSubscriptionExtras({
      sub,
      userId,
      tenantId,
      customData,
      priceId,
      userRecord,
      deps,
    });
  }
}

async function upsertSubscription(args: {
  sub: any;
  tenantId: string;
  userId: string;
  agentId?: string;
  branchId?: string;
  mappedStatus: InternalSubscriptionStatus;
  priceId: string;
}) {
  const { sub, tenantId, userId, agentId, branchId, mappedStatus, priceId } = args;
  const values = mapToSubscriptionValues(sub, mappedStatus, priceId);

  await db
    .insert(subscriptions)
    .values({
      id: sub.id,
      tenantId,
      userId,
      agentId,
      branchId,
      ...values,
    })
    .onConflictDoUpdate({
      target: subscriptions.id,
      set: {
        ...values,
        agentId,
        branchId,
      },
    });
}

function mapToSubscriptionValues(
  sub: any,
  mappedStatus: InternalSubscriptionStatus,
  priceId: string
) {
  const baseValues = {
    status: mappedStatus,
    planId: priceId,
    providerCustomerId: (sub.customerId || sub.customer_id) as string | null,
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

  return baseValues;
}
