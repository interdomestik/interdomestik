import { db } from '@interdomestik/database';
import { RetryablePaddleWebhookError } from '../../errors';
import type { CheckoutCustomData, ResolvePaddleCustomer } from '../../types';

export type TransactionPayloadLike = {
  customerId?: string | null;
  customer_id?: string | null;
  customerEmail?: string | null;
  customer_email?: string | null;
  customData?: CheckoutCustomData;
  custom_data?: CheckoutCustomData;
};

export function normalizeCheckoutText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isValidPaddleCustomerEmail(value: string): boolean {
  if (/\s/u.test(value)) return false;
  const separator = value.indexOf('@');
  if (separator <= 0 || separator !== value.lastIndexOf('@')) return false;
  const domain = value.slice(separator + 1);
  const dot = domain.indexOf('.', 1);
  return dot > 0 && dot < domain.length - 1;
}

export function isPaddleCustomerId(value: string): boolean {
  return /^ctm_[a-z\d]{26}$/u.test(value);
}

export async function loadCheckoutTransactionData(args: {
  transactionId: string;
  subscriptionId: string;
  processingScopeKey: string;
  entityRoute: boolean;
}): Promise<TransactionPayloadLike | null> {
  // db-access-guard: system-exempt -- reason: verified Paddle transaction evidence bootstraps checkout reconciliation before user context exists
  const webhookEvent = await db.query.webhookEvents.findFirst({
    where: (events, { and, eq }) =>
      args.entityRoute
        ? and(
            eq(events.providerTransactionId, args.transactionId),
            eq(events.provider, 'paddle'),
            eq(events.signatureValid, true),
            eq(events.eventType, 'transaction.completed'),
            eq(events.processingScopeKey, args.processingScopeKey)
          )
        : eq(events.providerTransactionId, args.transactionId),
    columns: { payload: true, processingResult: true },
  });

  if (!webhookEvent) {
    if (args.entityRoute) {
      throw new RetryablePaddleWebhookError(
        `Verified transaction ${args.transactionId} is not ready for subscription ${args.subscriptionId}`
      );
    }
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${args.subscriptionId}; transaction ${args.transactionId} not found`
    );
    return null;
  }
  if (args.entityRoute && webhookEvent.processingResult !== 'ok') {
    if (!webhookEvent.processingResult || webhookEvent.processingResult === 'retryable_error') {
      throw new RetryablePaddleWebhookError(
        `Verified transaction ${args.transactionId} is still processing for subscription ${args.subscriptionId}`
      );
    }
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${args.subscriptionId}; verified transaction ${args.transactionId} failed permanently`
    );
    return null;
  }

  const transactionData = (webhookEvent.payload as { data?: TransactionPayloadLike } | undefined)
    ?.data;
  if (!transactionData) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${args.subscriptionId}; verified transaction ${args.transactionId} payload is malformed`
    );
    return null;
  }
  return transactionData;
}

export async function resolveEntityCustomerEmail(args: {
  transactionData: TransactionPayloadLike;
  subscriptionCustomerId: string | null;
  subscriptionId: string;
  resolvePaddleCustomer?: ResolvePaddleCustomer;
}): Promise<string | null> {
  const transactionCustomerId = normalizeCheckoutText(
    args.transactionData.customerId || args.transactionData.customer_id
  );
  if (
    !transactionCustomerId ||
    !isPaddleCustomerId(transactionCustomerId) ||
    args.subscriptionCustomerId !== transactionCustomerId ||
    !args.resolvePaddleCustomer
  ) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${args.subscriptionId}; verified customer identity is missing or conflicting`
    );
    return null;
  }

  const lookup = await args.resolvePaddleCustomer(transactionCustomerId);
  if (lookup.kind === 'failed') {
    if (lookup.retryable) {
      throw new RetryablePaddleWebhookError(
        `Paddle customer ${transactionCustomerId} is temporarily unavailable for subscription ${args.subscriptionId}`
      );
    }
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${args.subscriptionId}; Paddle customer lookup failed permanently`
    );
    return null;
  }

  const email = normalizeCheckoutText(lookup.customer.email)?.toLowerCase() ?? null;
  if (
    lookup.customer.id !== transactionCustomerId ||
    lookup.customer.status !== 'active' ||
    !email ||
    !isValidPaddleCustomerEmail(email)
  ) {
    console.warn(
      `[Webhook] Cannot reconcile checkout user for subscription ${args.subscriptionId}; Paddle customer response is invalid`
    );
    return null;
  }
  return email;
}
