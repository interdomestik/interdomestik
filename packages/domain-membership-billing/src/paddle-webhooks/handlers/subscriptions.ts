import { db, eq, subscriptions } from '@interdomestik/database';
import { findSubscriptionByProviderReference } from '../../subscription';
import { subscriptionEventDataSchema } from '../schemas';
import { mapPaddleStatus, type InternalSubscriptionStatus } from '../subscription-status';

import type { PaddleWebhookAuditDeps, PaddleWebhookDeps } from '../types';
import { resolveSubscriptionContext } from './utils/context';
import { handleNewSubscriptionExtras } from './utils/extras';
import { reconcileCheckoutUser } from './utils/reconcile-checkout-user';

export async function handleSubscriptionChanged(
  params: { eventType: string; data: unknown },
  deps: Pick<PaddleWebhookDeps, 'sendThankYouLetter' | 'requestPasswordResetOnboarding'> &
    PaddleWebhookAuditDeps = {}
) {
  const parseResult = subscriptionEventDataSchema.safeParse(params.data);
  if (!parseResult.success) {
    console.error('[Webhook] Invalid subscription data:', parseResult.error);
    return;
  }
  const sub = parseResult.data;

  // 1. Resolve Context (User, Tenant, Branch)
  let context = await resolveSubscriptionContext(sub);
  if (!context && params.eventType === 'subscription.created') {
    context = await reconcileCheckoutUser(sub, deps);
  }
  if (!context) {
    throw new Error(`Unable to resolve subscription context for ${sub.id}`);
  }

  const { userId, tenantId, branchId, customData, userRecord } = context;

  const priceId = sub.items?.[0]?.price?.id || sub.items?.[0]?.priceId || 'unknown';
  const mappedStatus = mapPaddleStatus(sub.status);

  // 2. Upsert Subscription
  const storedSubscriptionId = await upsertSubscription({
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
      internalSubscriptionId: storedSubscriptionId,
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
  const existingSubscription = await findExistingSubscription(sub.id, userId);

  if (existingSubscription) {
    await updateSubscription(existingSubscription.id, {
      tenantId,
      userId,
      agentId,
      branchId,
      providerSubscriptionId: sub.id,
      ...values,
    });

    return existingSubscription.id;
  }

  const insertValues = {
    id: sub.id,
    tenantId,
    userId,
    agentId,
    branchId,
    providerSubscriptionId: sub.id,
    ...values,
  };

  try {
    await db.insert(subscriptions).values(insertValues);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const racedSubscription = await findExistingSubscription(sub.id, userId);
    if (!racedSubscription) {
      throw error;
    }

    await updateSubscription(racedSubscription.id, {
      tenantId,
      userId,
      agentId,
      branchId,
      providerSubscriptionId: sub.id,
      ...values,
    });

    return racedSubscription.id;
  }

  return sub.id as string;
}

async function findExistingSubscription(subId: string, userId: string) {
  return (
    (await findSubscriptionByProviderReference(subId)) ??
    (await db.query.subscriptions.findFirst({
      where: (subs, { eq }) => eq(subs.userId, userId),
      columns: { id: true, tenantId: true, userId: true },
    }))
  );
}

async function updateSubscription(subscriptionId: string, values: Record<string, unknown>) {
  await db.update(subscriptions).set(values).where(eq(subscriptions.id, subscriptionId));
}

function mapToSubscriptionValues(
  sub: any,
  mappedStatus: InternalSubscriptionStatus,
  priceId: string
) {
  const currentStartsAt =
    sub.currentBillingPeriod?.startsAt || (sub.current_billing_period?.starts_at as string);
  const currentEndsAt =
    sub.currentBillingPeriod?.endsAt || (sub.current_billing_period?.ends_at as string);

  const baseValues = {
    status: mappedStatus,
    planId: priceId,
    providerCustomerId: (sub.customerId || sub.customer_id) as string | null,
    currentPeriodStart: parseDate(currentStartsAt),
    currentPeriodEnd: parseDate(currentEndsAt),
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

function parseDate(dateStr: string | undefined | null): Date | null {
  return dateStr ? new Date(dateStr) : null;
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
