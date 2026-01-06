import { db, subscriptions } from '@interdomestik/database';
import { createCommissionCore } from '../../commissions/create';
import { calculateCommission } from '../../commissions/types';
import { subscriptionEventDataSchema } from '../schemas';
import { mapPaddleStatus, type InternalSubscriptionStatus } from '../subscription-status';

import type { PaddleWebhookAuditDeps, PaddleWebhookDeps } from '../types';

const redactEmail = (email?: string | null) => {
  if (!email) return 'unknown';
  const [local, domain] = email.split('@');
  if (!domain) return 'unknown';
  const maskedLocal = local.length <= 2 ? `${local[0] ?? ''}*` : `${local[0]}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
};

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

  const tenantId = existingSub?.tenantId ?? userRecord?.tenantId;

  // Guardrail: never guess a tenant. If we cannot resolve tenant, abort the write.
  if (!tenantId) {
    console.warn(
      `[Webhook] Cannot resolve tenant for subscription ${sub.id} userId=${userId}; skipping write`
    );
    return;
  }

  const branchId = await resolveBranchId({
    customData,
    tenantId,
    db: db,
  });

  const values = mapToSubscriptionValues(sub, mappedStatus, priceId);

  await db
    .insert(subscriptions)
    .values({
      id: sub.id,
      tenantId,
      userId,
      agentId: customData?.agentId,
      branchId,
      ...values,
    })
    .onConflictDoUpdate({
      target: subscriptions.id,
      set: {
        ...values,
        agentId: customData?.agentId,
        branchId,
      },
    });

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

  // Commission + welcome letter only for new subs.
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
// --- Helpers ---

async function resolveBranchId(args: {
  customData: { agentId?: string } | undefined;
  tenantId: string;
  db: typeof db;
}): Promise<string | undefined> {
  const { customData, tenantId, db: database } = args;

  // 1. Prefer Agent's Branch
  if (customData?.agentId) {
    const agent = await database.query.user.findFirst({
      where: (u, { and, eq }) => and(eq(u.id, customData.agentId!), eq(u.tenantId, tenantId)),
      columns: { branchId: true },
    });
    return agent?.branchId || undefined;
  }

  // 2. Fallback to Tenant Default Branch
  const defaultBranchSetting = await database.query.tenantSettings.findFirst({
    where: (ts, { and, eq }) =>
      and(eq(ts.tenantId, tenantId), eq(ts.category, 'rbac'), eq(ts.key, 'default_branch_id')),
    columns: { value: true },
  });

  const value = defaultBranchSetting?.value as unknown;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return (
      (typeof obj.branchId === 'string' && obj.branchId) ||
      (typeof obj.defaultBranchId === 'string' && obj.defaultBranchId) ||
      (typeof obj.id === 'string' && obj.id) ||
      (typeof obj.value === 'string' && obj.value) ||
      undefined
    );
  }
  return undefined;
}

async function handleNewSubscriptionExtras(args: {
  sub: any;
  userId: string;
  tenantId: string;
  customData: { agentId?: string } | undefined;
  priceId: string;
  userRecord: any;
  deps: Pick<PaddleWebhookDeps, 'sendThankYouLetter'> & PaddleWebhookAuditDeps;
}) {
  const { sub, userId, tenantId, customData, priceId, userRecord, deps } = args;

  // 1. Commissions
  const agentId = customData?.agentId;
  const transactionTotal = Number.parseFloat(sub.items?.[0]?.price?.unitPrice?.amount || '0') / 100;

  if (agentId && transactionTotal > 0) {
    const agentSettings = await db.query.agentSettings?.findFirst({
      where: (settings, { and, eq }) =>
        and(eq(settings.agentId, agentId), eq(settings.tenantId, tenantId)),
    });
    const customRates = agentSettings?.commissionRates as Record<string, number> | undefined;

    const commissionAmount = calculateCommission('new_membership', transactionTotal, customRates);
    const commissionResult = await createCommissionCore({
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

    if (deps.logAuditEvent && commissionResult.success) {
      await deps.logAuditEvent({
        actorRole: 'system',
        action: 'commission.created',
        entityType: 'commission',
        entityId: commissionResult.data?.id ?? null,
        tenantId,
        metadata: {
          agentId,
          memberId: userId,
          subscriptionId: sub.id,
          amount: commissionAmount,
          currency: sub.items?.[0]?.price?.unitPrice?.currencyCode || 'EUR',
          source: 'paddle_webhook',
        },
      });
    }
    console.log(
      `[Webhook] 💰 Commission created: €${commissionAmount} for agent ${agentId}${customRates ? ' (custom rates)' : ''}`
    );
  }

  // 2. Thank You Letter
  if (deps.sendThankYouLetter) {
    try {
      if (userRecord) {
        const planPrice = sub.items?.[0]?.price?.unitPrice?.amount
          ? (Number.parseFloat(sub.items[0].price.unitPrice.amount) / 100).toFixed(2)
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
