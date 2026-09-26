import { RetryablePaddleWebhookError } from '../errors';
import { subscriptionEventDataSchema } from '../schemas';

import type { PaddleWebhookAuditDeps, PaddleWebhookDeps } from '../types';
import { resolveSubscriptionEventOrder } from './subscription-event-order';
import { resolveSubscriptionForUpsert, type UpsertSubscriptionResult } from './subscription-upsert';
import { writeSubscriptionSnapshot } from './subscription-snapshot';
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
  /** Signed top-level Paddle `occurred_at`, validated before any side effect. */
  providerEventOccurredAt?: string | null;
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
  const order = resolveSubscriptionEventOrder({
    processingScopeKey: params.processingScopeKey,
    providerEventId: params.providerEventId,
    providerEventOccurredAt: params.providerEventOccurredAt,
    providerSubscriptionId: sub.id,
  });

  if (!order && (await deliverStoredMembershipConfirmationRetry(params, sub.id, deps))) return;

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
  const priceId = sub.items?.[0]?.price?.id || sub.items?.[0]?.priceId || 'unknown';
  const writeSnapshot = () =>
    writeSubscriptionSnapshot({
      eventType: params.eventType,
      providerEventId: params.providerEventId,
      sub,
      tenantId,
      userId,
      agentId: resolvedAgentId,
      branchId,
      existingSub: subscriptionForUpsert,
      order,
      priceId,
      deps,
    });

  // Entity-scoped events take the atomic ordering decision before touching the
  // confirmation store, so a stale event never claims, readies or sends.
  let subscriptionUpsert: UpsertSubscriptionResult | undefined;
  if (order) {
    subscriptionUpsert = await writeSnapshot();
    if (subscriptionUpsert.stale) {
      console.warn(
        `[Webhook] Ignored stale provider event ${params.providerEventId} for subscription ${sub.id}; a newer verified snapshot is applied`
      );
      return;
    }
    if (await deliverStoredMembershipConfirmationRetry(params, sub.id, deps)) return;
  }

  const confirmationPreparation =
    params.eventType === 'subscription.created'
      ? await prepareMembershipConfirmation({
          eventType: params.eventType,
          providerEventId: params.providerEventId,
          webhookPayloadHash: params.webhookPayloadHash,
          internalSubscriptionId:
            subscriptionUpsert?.subscriptionId ?? subscriptionForUpsert?.id ?? sub.id,
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

  // 2. Upsert Subscription (legacy route order: after the confirmation claim)
  subscriptionUpsert ??= await writeSnapshot();
  const storedSubscriptionId = subscriptionUpsert.subscriptionId;

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
