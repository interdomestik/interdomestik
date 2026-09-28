import { and, db, eq, subscriptions } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { getPaddle, resolveBillingEntityForTenantId } from '../paddle-server';

import type { PaymentUpdateUrlResult, SubscriptionSession } from './types';

// Canonical roles allowed to trigger their own payment-method recovery. Agents/staff/admin
// act on behalf of members through separate, more privileged flows, not this member action.
const CANONICAL_MEMBER_ROLES = new Set(['member', 'user']);

// Paddle ids are opaque, of the form `<prefix>_<26 lowercase alphanumeric characters>`.
// See https://developer.paddle.com/api-reference/about/ids
const PADDLE_SUBSCRIPTION_ID_PATTERN = /^sub_[a-z\d]{26}$/u;
const PADDLE_TRANSACTION_ID_PATTERN = /^txn_[a-z\d]{26}$/u;
const PADDLE_CUSTOMER_ID_PATTERN = /^ctm_[a-z\d]{26}$/u;

// A payment-update transaction is only meaningful for a subscription that is currently
// billed automatically and either active (method update) or past_due (recovery), per
// https://developer.paddle.com/api-reference/subscriptions/get-subscription-update-payment-method-transaction
const ELIGIBLE_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due']);

// An active subscription receives a new zero-value method-change transaction.
// A past-due subscription receives its most recent past-due transaction.
const ACTIVE_METHOD_CHANGE_STATUSES = new Set(['draft', 'ready']);

// Per-entity approved Paddle default payment link (origin + exact path), configured out of
// band in the Paddle dashboard. checkout.url must resolve to exactly this link; see
// https://developer.paddle.com/build/transactions/default-payment-link/
const PAYMENT_UPDATE_LINK_ENV_VARS: Record<'ks' | 'mk' | 'al', string> = {
  ks: 'PADDLE_DEFAULT_PAYMENT_LINK_KS',
  mk: 'PADDLE_DEFAULT_PAYMENT_LINK_MK',
  al: 'PADDLE_DEFAULT_PAYMENT_LINK_AL',
};

// Narrow, documented subset of the Paddle transaction shape this action relies on.
// See https://developer.paddle.com/api-reference/subscriptions/get-subscription-update-payment-method-transaction
type PaymentUpdateTransaction = {
  id?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
  collectionMode?: string | null;
  status?: string | null;
  origin?: string | null;
  details?: { totals?: { total?: string | null } | null } | null;
  checkout?: { url?: string | null } | null;
};

type TrustedPaymentLink = {
  origin: string;
  pathname: string;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveTrustedPaymentLink(tenantId: string): TrustedPaymentLink | null {
  const entity = resolveBillingEntityForTenantId(tenantId);
  if (!entity) return null;

  const envVar = PAYMENT_UPDATE_LINK_ENV_VARS[entity];
  const raw = normalizeText(process.env[envVar]);
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;
  if (!parsed.pathname || parsed.pathname === '') return null;

  return { origin: parsed.origin, pathname: parsed.pathname };
}

// Validates the returned checkout URL against the tenant's approved Paddle default payment
// link (exact origin AND exact path — a same-origin different path is not the approved link)
// and requires `_ptxn` to exactly match the verified transaction id.
function resolveTrustedCheckoutUrl(params: {
  rawUrl: unknown;
  trustedLink: TrustedPaymentLink;
  transactionId: string;
}): string | null {
  const text = normalizeText(params.rawUrl);
  if (!text) return null;

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.hash) return null;
  if (parsed.origin !== params.trustedLink.origin) return null;
  if (parsed.pathname !== params.trustedLink.pathname) return null;

  const queryKeys = Array.from(parsed.searchParams.keys());
  if (queryKeys.length !== 1 || queryKeys[0] !== '_ptxn') return null;

  const ptxnValues = parsed.searchParams.getAll('_ptxn');
  if (ptxnValues.length !== 1 || ptxnValues[0] !== params.transactionId) return null;

  return parsed.toString();
}

function validatePaymentUpdateTransaction(params: {
  transaction: PaymentUpdateTransaction | null | undefined;
  providerSubscriptionId: string;
  providerCustomerId: string;
  subscriptionStatus: string;
  trustedLink: TrustedPaymentLink;
}): PaymentUpdateUrlResult {
  const {
    transaction,
    providerSubscriptionId,
    providerCustomerId,
    subscriptionStatus,
    trustedLink,
  } = params;
  const transactionId = normalizeText(transaction?.id);
  if (!transactionId || !PADDLE_TRANSACTION_ID_PATTERN.test(transactionId)) {
    return { error: 'No checkout URL generated', url: undefined };
  }

  if (normalizeText(transaction?.subscriptionId) !== providerSubscriptionId) {
    return { error: 'Payment update transaction did not match this subscription', url: undefined };
  }

  if (normalizeText(transaction?.customerId) !== providerCustomerId) {
    return { error: 'Payment update transaction did not match this member', url: undefined };
  }

  if (normalizeText(transaction?.collectionMode) !== 'automatic') {
    return { error: 'Payment update is only available for automatic billing', url: undefined };
  }

  const isPastDueRecovery = subscriptionStatus === 'past_due' && transaction?.status === 'past_due';
  const isActiveMethodChange =
    subscriptionStatus === 'active' &&
    ACTIVE_METHOD_CHANGE_STATUSES.has(transaction?.status ?? '') &&
    transaction?.origin === 'subscription_payment_method_change' &&
    transaction?.details?.totals?.total === '0';
  if (!isPastDueRecovery && !isActiveMethodChange) {
    return { error: 'Payment update transaction is not in a usable state', url: undefined };
  }

  const url = resolveTrustedCheckoutUrl({
    rawUrl: transaction?.checkout?.url,
    trustedLink,
    transactionId,
  });
  if (!url) return { error: 'No checkout URL generated', url: undefined };
  return { url, error: undefined };
}

export async function getPaymentUpdateUrlCore(params: {
  session: SubscriptionSession | null;
  subscriptionId: string;
}): Promise<PaymentUpdateUrlResult> {
  const { session, subscriptionId } = params;

  if (!session) {
    return { error: 'Unauthorized', url: undefined };
  }

  const role = normalizeText(session.user.role);
  if (!role || !CANONICAL_MEMBER_ROLES.has(role)) {
    return { error: 'Unauthorized', url: undefined };
  }

  try {
    const tenantId = ensureTenantId(session);
    const sub = await db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)),
    });

    if (!sub) {
      return { error: 'Subscription not found or access denied', url: undefined };
    }

    if (sub.userId !== session.user.id || sub.tenantId !== tenantId) {
      return { error: 'Subscription not found or access denied', url: undefined };
    }

    if ((sub.provider ?? null) !== 'paddle') {
      return { error: 'Subscription is not managed by the payment provider', url: undefined };
    }

    if (!ELIGIBLE_SUBSCRIPTION_STATUSES.has(sub.status ?? '')) {
      return { error: 'Subscription is not eligible for payment method recovery', url: undefined };
    }

    // Never fall back to the internal subscription id: it is not a verified Paddle
    // provider reference, and calling the provider with it would leak/confuse identity.
    const providerSubscriptionId = normalizeText(sub.providerSubscriptionId);
    if (!providerSubscriptionId || !PADDLE_SUBSCRIPTION_ID_PATTERN.test(providerSubscriptionId)) {
      return {
        error: 'Subscription is not linked to a verified provider reference',
        url: undefined,
      };
    }

    const providerCustomerId = normalizeText(sub.providerCustomerId);
    if (!providerCustomerId || !PADDLE_CUSTOMER_ID_PATTERN.test(providerCustomerId)) {
      return {
        error: 'Subscription is missing a verified provider customer reference',
        url: undefined,
      };
    }

    const trustedLink = resolveTrustedPaymentLink(tenantId);
    if (!trustedLink) {
      console.error(
        `[getPaymentUpdateUrlCore] Missing or invalid approved payment update link for tenant ${tenantId}`
      );
      return { error: 'Payment update is not available right now', url: undefined };
    }

    const paddle = getPaddle({ tenantId });
    const transaction = (await paddle.subscriptions.getPaymentMethodChangeTransaction(
      providerSubscriptionId
    )) as PaymentUpdateTransaction | null | undefined;

    return validatePaymentUpdateTransaction({
      transaction,
      providerSubscriptionId,
      providerCustomerId,
      subscriptionStatus: sub.status ?? '',
      trustedLink,
    });
  } catch {
    // Never log the raw error: provider client errors can carry API keys or tokens.
    console.error('[getPaymentUpdateUrlCore] Failed to get payment update URL');
    return { error: 'Failed to generate update link', url: undefined };
  }
}
