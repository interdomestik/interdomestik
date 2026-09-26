import { resolveCanonicalMembershipPlanState } from '../../annual-membership';
import { RetryablePaddleWebhookError } from '../errors';
import { subscriptionEventDataSchema } from '../schemas';
import { mapPaddleStatus } from '../subscription-status';

import type { PaddleWebhookAuditDeps, PaddleWebhookDeps } from '../types';
import { resolveSubscriptionForUpsert, upsertSubscription } from './subscription-upsert';
import { resolveSubscriptionContext } from './utils/context';
import { handleNewSubscriptionExtras } from './utils/extras';
import {
  deliverMembershipConfirmation,
  prepareMembershipConfirmation,
  readyMembershipConfirmation,
} from './utils/membership-confirmation';
import { prepareStoredMembershipConfirmationRetry } from './utils/membership-confirmation-retry';
import { reconcileCheckoutUser } from './utils/reconcile-checkout-user';
import { resolveEntityCheckoutTransactionAuthority } from './utils/checkout-transaction-evidence';

type SubscriptionChangedParams = {
  eventType: string;
  data: unknown;
  tenantId?: string | null;
  processingScopeKey?: string;
  providerEventId?: string;
  webhookPayloadHash?: string;
};

type SubscriptionChangedDeps = Pick<
  PaddleWebhookDeps,
  | 'membershipConfirmationDelivery'
  | 'prepareThankYouLetter'
  | 'sendThankYouLetter'
  | 'requestPasswordResetOnboarding'
  | 'resolvePaddleCustomer'
> &
  PaddleWebhookAuditDeps;

type SubscriptionEventData = Parameters<typeof resolveSubscriptionContext>[0];

export async function handleSubscriptionChanged(
  params: SubscriptionChangedParams,
  deps: SubscriptionChangedDeps = {}
) {
  const parseResult = subscriptionEventDataSchema.safeParse(params.data);
  if (!parseResult.success) {
    console.error('[Webhook] Invalid subscription data:', parseResult.error);
    return;
  }
  const sub = parseResult.data;

  if (await deliverStoredMembershipConfirmationRetry(params, sub.id, deps)) return;

  // 1. Resolve Context (User, Tenant, Branch)
  const context = await resolveAuthoritativeSubscriptionContext(params, sub, deps);

  const { userId, tenantId, branchId, customData, userRecord, existingSub } = context;
  const canonicalUserRecord = userRecord ?? null;
  const resolvedAgentId = resolveSubscriptionAgentId({
    userRecord: canonicalUserRecord,
    customData,
  });
  const subscriptionForUpsert = await resolveSubscriptionForUpsert({
    existingSub,
    tenantId,
    userId,
  });

  const confirmationPreparation =
    params.eventType === 'subscription.created'
      ? await prepareMembershipConfirmation({
          eventType: params.eventType,
          providerEventId: params.providerEventId,
          webhookPayloadHash: params.webhookPayloadHash,
          internalSubscriptionId: subscriptionForUpsert?.id ?? sub.id,
          sub,
          userId,
          tenantId,
          customData,
          userRecord: canonicalUserRecord,
          deps,
        })
      : { kind: 'continue' as const };
  if (confirmationPreparation.kind === 'stop') return;
  if (confirmationPreparation.kind === 'job' && !confirmationPreparation.job.requiresEffects) {
    await deliverMembershipConfirmation(confirmationPreparation.job);
    return;
  }

  const priceId = sub.items?.[0]?.price?.id || sub.items?.[0]?.priceId || 'unknown';
  const canonicalPlanState = await resolveCanonicalMembershipPlanState({
    tenantId,
    planId: priceId,
  });
  const mappedStatus = mapPaddleStatus(sub.status);

  // 2. Upsert Subscription
  const subscriptionUpsert = await upsertSubscription({
    sub,
    tenantId,
    userId,
    agentId: resolvedAgentId,
    branchId,
    existingSub: subscriptionForUpsert,
    mappedStatus,
    planState: canonicalPlanState,
    providerEventId: params.providerEventId,
  });
  const storedSubscriptionId = subscriptionUpsert.subscriptionId;

  // 3. Audit Log
  if (deps.logAuditEvent && subscriptionUpsert.effectsApplied) {
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
      eventType: params.eventType,
      providerEventId: params.providerEventId,
      internalSubscriptionId: storedSubscriptionId,
      sub,
      userId,
      tenantId,
      customData,
      priceId,
      userRecord: canonicalUserRecord,
      deps,
    });
    if (confirmationPreparation.kind === 'job') {
      await readyMembershipConfirmation(confirmationPreparation.job, storedSubscriptionId);
      await deliverMembershipConfirmation(confirmationPreparation.job);
    }
  }
}

async function resolveAuthoritativeSubscriptionContext(
  params: SubscriptionChangedParams,
  sub: SubscriptionEventData,
  deps: SubscriptionChangedDeps
) {
  let context = await resolveSubscriptionContext(sub);
  let checkoutAuthorityVerified = false;

  if (!context && params.eventType === 'subscription.created' && canReconcileCheckoutUser(sub)) {
    context = await reconcileCheckoutUser(sub, deps, params.processingScopeKey ?? '');
    checkoutAuthorityVerified = Boolean(
      context && params.processingScopeKey?.startsWith('entity:')
    );
  }
  if (!context) {
    throw new Error(`Unable to resolve subscription context for ${sub.id}`);
  }

  await assertInitialEntityOrderAuthority({
    params,
    sub,
    existingSub: context.existingSub,
    checkoutAuthorityVerified,
  });
  return context;
}

async function assertInitialEntityOrderAuthority(args: {
  params: SubscriptionChangedParams;
  sub: SubscriptionEventData;
  existingSub: unknown;
  checkoutAuthorityVerified: boolean;
}): Promise<void> {
  // A user-scoped fallback row can represent an older subscription. Only an
  // exact provider-reference match is already authoritative for lifecycle updates.
  if (!args.params.processingScopeKey?.startsWith('entity:') || args.existingSub) return;
  if (args.params.eventType !== 'subscription.created') {
    throw new RetryablePaddleWebhookError(
      `Initial entity subscription requires subscription.created for ${args.sub.id}`
    );
  }
  if (args.checkoutAuthorityVerified) return;
  if (await resolveEntityCheckoutTransactionAuthority(args.sub, args.params.processingScopeKey)) {
    return;
  }
  throw new Error(`Provider order integrity failed for subscription ${args.sub.id}`);
}

async function deliverStoredMembershipConfirmationRetry(
  params: SubscriptionChangedParams,
  providerReference: string,
  deps: SubscriptionChangedDeps
): Promise<boolean> {
  if (params.eventType !== 'subscription.created') return false;
  const preparation = await prepareStoredMembershipConfirmationRetry({
    tenantId: params.tenantId,
    providerEventId: params.providerEventId,
    webhookPayloadHash: params.webhookPayloadHash,
    providerReference,
    deps,
  });
  if (preparation.kind === 'continue') return false;
  if (preparation.kind === 'job') {
    await deliverMembershipConfirmation(preparation.job);
  }
  return true;
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
