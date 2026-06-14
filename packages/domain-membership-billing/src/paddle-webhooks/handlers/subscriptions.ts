import { resolveCanonicalMembershipPlanState } from '../../annual-membership';
import { subscriptionEventDataSchema } from '../schemas';
import { mapPaddleStatus } from '../subscription-status';

import type { PaddleWebhookAuditDeps, PaddleWebhookDeps } from '../types';
import { upsertSubscription } from './subscription-upsert';
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
  if (!context && params.eventType === 'subscription.created' && canReconcileCheckoutUser(sub)) {
    context = await reconcileCheckoutUser(sub, deps);
  }
  if (!context) {
    throw new Error(`Unable to resolve subscription context for ${sub.id}`);
  }

  const { userId, tenantId, branchId, customData, userRecord, existingSub } = context;
  const canonicalUserRecord = userRecord ?? null;
  const resolvedAgentId = resolveSubscriptionAgentId({
    userRecord: canonicalUserRecord,
    customData,
  });

  const priceId = sub.items?.[0]?.price?.id || sub.items?.[0]?.priceId || 'unknown';
  const canonicalPlanState = await resolveCanonicalMembershipPlanState({
    tenantId,
    planId: priceId,
  });
  const mappedStatus = mapPaddleStatus(sub.status);

  // 2. Upsert Subscription
  const storedSubscriptionId = await upsertSubscription({
    sub,
    tenantId,
    userId,
    agentId: resolvedAgentId,
    branchId,
    existingSub,
    mappedStatus,
    planState: canonicalPlanState,
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
      userRecord: canonicalUserRecord,
      deps,
    });
  }
}

function normalizeAgentId(agentId: string | null | undefined): string | null {
  if (typeof agentId !== 'string') {
    return null;
  }

  const normalized = agentId.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveSubscriptionAgentId(args: {
  userRecord?: { agentId?: string | null } | null;
  customData?: { agentId?: string };
}) {
  if (args.userRecord) {
    return normalizeAgentId(args.userRecord.agentId);
  }

  return normalizeAgentId(args.customData?.agentId);
}

function canReconcileCheckoutUser(sub: {
  transactionId?: string | null;
  transaction_id?: string | null;
  customData?: { userId?: string };
  custom_data?: { userId?: string };
}) {
  const transactionId = sub.transactionId || sub.transaction_id;
  const customData = sub.customData || sub.custom_data;
  return Boolean(transactionId && !normalizeText(customData?.userId));
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
