import { db } from '@interdomestik/database';
import { resolveBillingEntityForTenantId } from '../../../paddle-server';
import { RetryablePaddleWebhookError } from '../../errors';
import type { ResolvePaddleCustomer } from '../../types';

export type CheckoutCustomData = {
  userId?: string;
  agentId?: string;
  tenantId?: string;
  acquisitionSource?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
};

export type SubscriptionPayloadLike = {
  id: string;
  customerId?: string | null;
  customer_id?: string | null;
  transactionId?: string | null;
  transaction_id?: string | null;
  customData?: CheckoutCustomData;
  custom_data?: CheckoutCustomData;
};

type TransactionPayloadLike = {
  customerId?: string | null;
  customer_id?: string | null;
  customerEmail?: string | null;
  customer_email?: string | null;
  customData?: CheckoutCustomData;
  custom_data?: CheckoutCustomData;
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function hasConflict(
  field: 'tenantId' | 'userId',
  current: CheckoutCustomData | undefined,
  stored: CheckoutCustomData | undefined
): boolean {
  const currentValue = normalizeText(current?.[field]);
  const storedValue = normalizeText(stored?.[field]);
  return Boolean(currentValue && storedValue && currentValue !== storedValue);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function isPaddleCustomerId(value: string): boolean {
  return /^ctm_[a-z\d]{26}$/u.test(value);
}

export async function resolveCheckoutTransactionEvidence(
  sub: SubscriptionPayloadLike,
  processingScopeKey: string,
  resolvePaddleCustomer?: ResolvePaddleCustomer
): Promise<{ customerEmail: string; customData: CheckoutCustomData } | null> {
  const transactionId = normalizeText(sub.transactionId || sub.transaction_id);
  if (!transactionId) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; missing transactionId`
    );
    return null;
  }

  const subscriptionCustomData = sub.customData || sub.custom_data;
  const subscriptionTenantId = normalizeText(subscriptionCustomData?.tenantId);
  const billingEntity = resolveBillingEntityForTenantId(subscriptionTenantId);
  const isEntityRoute = processingScopeKey.startsWith('entity:');
  if (isEntityRoute && processingScopeKey !== (billingEntity ? `entity:${billingEntity}` : null)) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; entity route and tenant context do not match`
    );
    return null;
  }

  const subscriptionCustomerId = normalizeText(sub.customerId || sub.customer_id);
  if (isEntityRoute && (!subscriptionCustomerId || !isPaddleCustomerId(subscriptionCustomerId))) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; verified subscription customer identity is missing or invalid`
    );
    return null;
  }

  // db-access-guard: system-exempt -- reason: verified Paddle transaction evidence bootstraps checkout reconciliation before user context exists
  const webhookEvent = await db.query.webhookEvents.findFirst({
    where: (events, { and, eq }) =>
      isEntityRoute
        ? and(
            eq(events.providerTransactionId, transactionId),
            eq(events.provider, 'paddle'),
            eq(events.signatureValid, true),
            eq(events.eventType, 'transaction.completed'),
            eq(events.processingResult, 'ok'),
            eq(events.processingScopeKey, processingScopeKey)
          )
        : eq(events.providerTransactionId, transactionId),
    columns: { payload: true },
  });

  if (!webhookEvent) {
    if (isEntityRoute) {
      throw new RetryablePaddleWebhookError(
        `Verified transaction ${transactionId} is not ready for subscription ${sub.id}`
      );
    }
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; transaction ${transactionId} not found`
    );
    return null;
  }

  const transactionData = (webhookEvent.payload as { data?: TransactionPayloadLike } | undefined)
    ?.data;
  if (!transactionData) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; verified transaction ${transactionId} payload is malformed`
    );
    return null;
  }

  const transactionCustomData = transactionData.customData || transactionData.custom_data;
  if (
    hasConflict('tenantId', subscriptionCustomData, transactionCustomData) ||
    hasConflict('userId', subscriptionCustomData, transactionCustomData)
  ) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; subscription customData conflicts with stored transaction ${transactionId}`
    );
    return null;
  }
  const customData = { ...transactionCustomData, ...subscriptionCustomData };
  const tenantId = normalizeText(customData.tenantId);

  let customerEmail: string | null;
  if (isEntityRoute) {
    const transactionCustomerId = normalizeText(
      transactionData.customerId || transactionData.customer_id
    );
    if (
      !transactionCustomerId ||
      !isPaddleCustomerId(transactionCustomerId) ||
      subscriptionCustomerId !== transactionCustomerId ||
      !resolvePaddleCustomer
    ) {
      console.warn(
        `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; verified customer identity is missing or conflicting`
      );
      return null;
    }

    const lookup = await resolvePaddleCustomer(transactionCustomerId);
    if (lookup.kind === 'failed') {
      if (lookup.retryable) {
        throw new RetryablePaddleWebhookError(
          `Paddle customer ${transactionCustomerId} is temporarily unavailable for subscription ${sub.id}`
        );
      }
      console.warn(
        `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; Paddle customer lookup failed permanently`
      );
      return null;
    }

    customerEmail = normalizeText(lookup.customer.email)?.toLowerCase() ?? null;
    if (
      lookup.customer.id !== transactionCustomerId ||
      lookup.customer.status !== 'active' ||
      !customerEmail ||
      !isValidEmail(customerEmail)
    ) {
      console.warn(
        `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; Paddle customer response is invalid`
      );
      return null;
    }
  } else {
    customerEmail =
      normalizeText(
        transactionData.customerEmail || transactionData.customer_email
      )?.toLowerCase() ?? null;
  }

  if (!tenantId || !customerEmail) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${sub.id}; missing tenant/email in stored transaction ${transactionId}`
    );
    return null;
  }

  return { customerEmail, customData };
}
