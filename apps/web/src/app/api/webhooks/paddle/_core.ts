import {
  prepareThankYouLetterCore,
  sendPreparedThankYouLetterCore,
} from '@/actions/thank-you-letter/delivery';
import { logAuditEvent } from '@/lib/audit';
import { paddleDunningEmailDeps } from '@/lib/email';
import type { BillingEntity } from '@interdomestik/domain-membership-billing/paddle-server';
import {
  handlePaddleEvent,
  insertWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
  parsePaddleWebhookBody,
  persistInvoiceAndLedgerInvariants,
  persistInvalidSignatureAttempt,
  sha256Hex,
  verifyPaddleWebhook,
} from '@interdomestik/domain-membership-billing/paddle-webhooks';
import { membershipConfirmationDeliveryStore } from '@interdomestik/domain-membership-billing/paddle-webhooks/membership-confirmation-delivery';
import {
  PaddleSubscriptionReferenceAmbiguousError,
  isRetryablePaddleWebhookError,
} from '@interdomestik/domain-membership-billing/paddle-webhooks/persist';

import type { Paddle } from '@paddle/paddle-node-sdk';
import { requestPasswordResetOnboarding } from './paddle-onboarding';
import { resolvePaddleCustomer } from './paddle-customer';
import { buildPaddleEventDispatchParams } from './paddle-event-dispatch';
import { reconcilePaddleLeadConversion } from './paddle-lead-conversion';
import {
  getPaddleSubscriptionReferences,
  normalizeText,
  resolveWebhookSubscription,
  resolveWebhookTenant,
} from './paddle-webhook-resolution';

export {
  buildTenantPasswordResetRedirectUrl,
  requestPasswordResetOnboarding,
} from './paddle-onboarding';

export type PaddleWebhookCoreResult = {
  status: 200 | 400 | 401 | 500;
  body: Record<string, unknown>;
};

type PaddleTransactionData = {
  id?: string;
  transactionId?: string;
  transaction_id?: string;
};

function resolveProcessingScopeKey(params: {
  tenantId?: string | null;
  billingEntity?: BillingEntity;
}): string {
  if (params.billingEntity) return `entity:${params.billingEntity}`;

  const tenantId = normalizeText(params.tenantId);
  if (tenantId) return `tenant:${tenantId}`;

  return 'global';
}

function resolveScopedDedupeKey(params: {
  processingScopeKey: string;
  eventId?: string | null;
  payloadHash: string;
}): string {
  const eventId = normalizeText(params.eventId);
  if (eventId) {
    return `paddle:${params.processingScopeKey}:event:${eventId}`;
  }

  return `paddle:${params.processingScopeKey}:sha256:${params.payloadHash}`;
}

function resolveProviderTransactionId(params: {
  eventType?: string | null;
  data: unknown;
}): string | null {
  if (!params.eventType || !params.eventType.startsWith('transaction.')) {
    return null;
  }

  const payload = (params.data ?? {}) as PaddleTransactionData;
  return (
    normalizeText(payload.id) ||
    normalizeText(payload.transactionId) ||
    normalizeText(payload.transaction_id)
  );
}

export async function handlePaddleWebhookCore(args: {
  paddle: Paddle;
  headers: Headers;
  signature: string | null;
  secret: string | undefined;
  bodyText: string;
  billingEntity?: BillingEntity;
}): Promise<PaddleWebhookCoreResult> {
  const { paddle, headers, signature, secret, bodyText, billingEntity } = args;

  if (!signature || !secret) {
    return { status: 400, body: { error: 'Missing signature or secret' } };
  }

  const payloadHash = sha256Hex(bodyText);
  const parsedBody = parsePaddleWebhookBody(bodyText);
  const { parsedPayload, eventTypeFromPayload, eventIdFromPayload, eventTimestampFromPayload } =
    parsedBody;

  let verified: Awaited<ReturnType<typeof verifyPaddleWebhook>>;
  try {
    verified = await verifyPaddleWebhook({
      paddle,
      body: bodyText,
      secret,
      signature,
      parsedPayload,
      billingEntity,
    });
  } catch {
    try {
      const normalizedEventIdFromPayload = normalizeText(eventIdFromPayload);
      const processingScopeKey = resolveProcessingScopeKey({ billingEntity });
      const dedupeKey = resolveScopedDedupeKey({
        processingScopeKey,
        eventId: normalizedEventIdFromPayload,
        payloadHash,
      });

      await persistInvalidSignatureAttempt(
        {
          headers,
          processingScopeKey,
          dedupeKey,
          eventType: eventTypeFromPayload,
          eventId: normalizedEventIdFromPayload ?? undefined,
          eventTimestamp: eventTimestampFromPayload,
          payloadHash,
          parsedPayload,
        },
        { logAuditEvent }
      );
    } catch {
      // Best-effort persistence; ignore errors.
    }

    return { status: 401, body: { error: 'Invalid signature' } };
  }

  const eventData = verified.eventData;
  const signatureValid = verified.signatureValid;
  const signatureBypassed = verified.signatureBypassed;

  if (!eventData) {
    return { status: 401, body: { error: 'Invalid event data' } };
  }

  const eventType = (eventData as { eventType?: string }).eventType || eventTypeFromPayload;
  const eventId =
    (eventData as { eventId?: string }).eventId ||
    (eventData as { event_id?: string }).event_id ||
    eventIdFromPayload;
  const normalizedEventId = normalizeText(eventId);
  const data = (eventData as { data?: unknown }).data;

  const subscription = await resolveWebhookSubscription(verified.delivery, data);
  const webhookTenant = await resolveWebhookTenant(verified.delivery, data, subscription);
  const tenantId = webhookTenant?.tenantId ?? null;
  const processingScopeKey = resolveProcessingScopeKey({ tenantId, billingEntity });
  const dedupeKey = resolveScopedDedupeKey({
    processingScopeKey,
    eventId: normalizedEventId,
    payloadHash,
  });
  const providerTransactionId = resolveProviderTransactionId({ eventType, data });

  const insertResult = await insertWebhookEvent(
    {
      headers,
      processingScopeKey,
      dedupeKey,
      eventType,
      eventId: normalizedEventId ?? undefined,
      providerTransactionId,
      signatureValid,
      signatureBypassed,
      eventTimestamp: eventTimestampFromPayload,
      payloadHash,
      parsedPayload,
      tenantId,
      authority: webhookTenant?.authority ?? null,
    },
    { logAuditEvent }
  );

  if (!insertResult.inserted) {
    return { status: 200, body: { success: true, duplicate: true } };
  }

  const { receiptLease, webhookEventRowId } = insertResult;
  try {
    if (subscription === 'ambiguous') {
      // Terminal, non-retryable: recorded on the admitted receipt, then nothing else runs.
      throw new PaddleSubscriptionReferenceAmbiguousError(
        getPaddleSubscriptionReferences(data).join(',')
      );
    }
    await persistInvoiceAndLedgerInvariants(
      {
        headers,
        delivery: verified.delivery,
        webhookEventRowId,
        eventType,
        eventId: normalizedEventId ?? undefined,
        tenantId,
        billingEntity: billingEntity ?? null,
        providerTransactionId,
        storedSubscriptionId: subscription?.subscription.id ?? null,
        data,
      },
      { logAuditEvent }
    );

    await reconcilePaddleLeadConversion({
      eventType,
      data,
      authority: webhookTenant?.authority ?? null,
      subscription: subscription?.subscription ?? null,
    });

    await handlePaddleEvent(
      buildPaddleEventDispatchParams({
        eventType,
        data,
        delivery: verified.delivery,
        authority: webhookTenant?.authority ?? null,
        processingScopeKey,
        providerEventId: normalizedEventId,
        providerEventOccurredAt: parsedBody.eventOccurredAtFromPayload,
        webhookPayloadHash: payloadHash,
      }),
      {
        membershipConfirmationDelivery: membershipConfirmationDeliveryStore,
        prepareThankYouLetter: prepareThankYouLetterCore,
        ...paddleDunningEmailDeps,
        sendThankYouLetter: sendPreparedThankYouLetterCore,
        requestPasswordResetOnboarding,
        resolvePaddleCustomer: customerId => resolvePaddleCustomer(paddle, customerId),
        logAuditEvent,
      }
    );
    await markWebhookProcessed(
      {
        headers,
        receiptLease,
        eventType,
        eventId: normalizedEventId ?? undefined,
        tenantId,
        authority: webhookTenant?.authority ?? null,
      },
      { logAuditEvent }
    );
  } catch (processingError) {
    await markWebhookFailed(
      {
        headers,
        receiptLease,
        eventType,
        eventId: normalizedEventId ?? undefined,
        error: processingError,
        retryable: isRetryablePaddleWebhookError(processingError),
        tenantId,
        authority: webhookTenant?.authority ?? null,
      },
      { logAuditEvent }
    );

    throw processingError;
  }

  return { status: 200, body: { success: true } };
}
