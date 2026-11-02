import {
  admitVerifiedPaddleReceipt,
  appendPaddleInvalidSignatureEvidence,
  completePaddleReceiptLease,
  type PaddleReceiptLease,
} from '@interdomestik/database/paddle-webhook-receipts';

import { RetryablePaddleWebhookError } from './errors';
import type { PaddleWebhookAuditDeps } from './types';

export type { PaddleReceiptLease } from '@interdomestik/database/paddle-webhook-receipts';

export { isRetryablePaddleWebhookError } from './errors';

export async function persistInvalidSignatureAttempt(
  params: {
    headers: Headers;
    processingScopeKey: string;
    dedupeKey: string;
    eventType: string | undefined;
    eventId: string | undefined;
    eventTimestamp: Date | null;
    payloadHash: string;
    parsedPayload: Record<string, unknown>;
  },
  deps: PaddleWebhookAuditDeps = {}
) {
  await appendPaddleInvalidSignatureEvidence({
    processingScopeKey: params.processingScopeKey,
    dedupeKey: params.dedupeKey,
    eventType: params.eventType ?? null,
    eventId: params.eventId ?? null,
    eventTimestamp: params.eventTimestamp,
    payloadHash: params.payloadHash,
    payload: params.parsedPayload,
  });

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'webhook.invalid_signature',
      entityType: 'webhook_event',
      metadata: {
        provider: 'paddle',
        eventType: params.eventType,
        eventId: params.eventId,
        payloadHash: params.payloadHash,
      },
      headers: params.headers,
    });
  }
}

export async function insertWebhookEvent(
  params: {
    headers: Headers;
    processingScopeKey: string;
    dedupeKey: string;
    eventType: string | undefined;
    eventId: string | undefined;
    providerTransactionId?: string | null;
    signatureValid: boolean;
    signatureBypassed: boolean;
    eventTimestamp: Date | null;
    payloadHash: string;
    parsedPayload: Record<string, unknown>;
    tenantId?: string | null;
  },
  deps: PaddleWebhookAuditDeps = {}
) {
  if (!params.signatureValid && !params.signatureBypassed) {
    throw new Error('Unverified Paddle webhook cannot be admitted as a receipt');
  }

  const admission = await admitVerifiedPaddleReceipt({
    processingScopeKey: params.processingScopeKey,
    dedupeKey: params.dedupeKey,
    eventType: params.eventType ?? null,
    eventId: params.eventId ?? null,
    providerTransactionId: params.providerTransactionId ?? null,
    tenantId: params.tenantId ?? null,
    eventTimestamp: params.eventTimestamp,
    payloadHash: params.payloadHash,
    payload: params.parsedPayload,
  });

  if (admission.outcome === 'admitted' && admission.reclaimed) {
    const receiptLease = admission.lease;
    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorRole: 'system',
        action: 'webhook.retry_received',
        entityType: 'webhook_event',
        entityId: receiptLease.id,
        tenantId: params.tenantId ?? undefined,
        metadata: {
          provider: 'paddle',
          dedupeKey: params.dedupeKey,
          processingScopeKey: params.processingScopeKey,
          eventType: params.eventType,
          eventId: params.eventId,
        },
        headers: params.headers,
      });
    }

    return { inserted: true as const, webhookEventRowId: receiptLease.id, receiptLease };
  }

  if (admission.outcome === 'in_progress') {
    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorRole: 'system',
        action: 'webhook.retry_deferred',
        entityType: 'webhook_event',
        entityId: admission.receiptId,
        tenantId: params.tenantId ?? undefined,
        metadata: {
          provider: 'paddle',
          dedupeKey: params.dedupeKey,
          processingScopeKey: params.processingScopeKey,
          eventType: params.eventType,
          eventId: params.eventId,
        },
        headers: params.headers,
      });
    }
    throw new RetryablePaddleWebhookError(
      `Paddle webhook ${params.eventId ?? params.dedupeKey} is still processing`
    );
  }

  if (admission.outcome === 'duplicate') {
    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorRole: 'system',
        action: 'webhook.duplicate',
        entityType: 'webhook_event',
        tenantId: params.tenantId ?? undefined,
        metadata: {
          provider: 'paddle',
          dedupeKey: params.dedupeKey,
          processingScopeKey: params.processingScopeKey,
          eventType: params.eventType,
          eventId: params.eventId,
          providerTransactionId: params.providerTransactionId ?? null,
          signatureBypassed: params.signatureBypassed,
        },
        headers: params.headers,
      });
    }

    return { inserted: false as const, webhookEventRowId: null };
  }

  const receiptLease = admission.lease;
  const webhookEventRowId = receiptLease.id;

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'webhook.received',
      entityType: 'webhook_event',
      entityId: webhookEventRowId,
      tenantId: params.tenantId ?? undefined,
      metadata: {
        provider: 'paddle',
        eventType: params.eventType,
        eventId: params.eventId,
        processingScopeKey: params.processingScopeKey,
        providerTransactionId: params.providerTransactionId ?? null,
        signatureValid: params.signatureValid,
        signatureBypassed: params.signatureBypassed,
      },
      headers: params.headers,
    });
  }

  return { inserted: true as const, webhookEventRowId, receiptLease };
}

export async function markWebhookProcessed(
  params: {
    headers: Headers;
    receiptLease: PaddleReceiptLease;
    eventType: string | undefined;
    eventId: string | undefined;
    tenantId?: string | null;
  },
  deps: PaddleWebhookAuditDeps = {}
): Promise<boolean> {
  const completed = await completePaddleReceiptLease(params.receiptLease, { result: 'ok' });
  if (!completed) {
    console.warn('[Paddle] Receipt lease was superseded before completion', params.receiptLease.id);
    return false;
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'webhook.processed',
      entityType: 'webhook_event',
      entityId: params.receiptLease.id,
      tenantId: params.tenantId || undefined,
      metadata: {
        provider: 'paddle',
        eventType: params.eventType,
        eventId: params.eventId,
        result: 'ok',
      },
      headers: params.headers,
    });
  }
  return true;
}

export async function markWebhookFailed(
  params: {
    headers: Headers;
    receiptLease: PaddleReceiptLease;
    eventType: string | undefined;
    eventId: string | undefined;
    error: unknown;
    retryable?: boolean;
    tenantId?: string | null;
  },
  deps: PaddleWebhookAuditDeps = {}
): Promise<boolean> {
  const message = params.error instanceof Error ? params.error.message : String(params.error);

  const completed = await completePaddleReceiptLease(params.receiptLease, {
    result: params.retryable ? 'retryable_error' : 'error',
    error: message,
  });
  if (!completed) {
    console.warn('[Paddle] Receipt lease was superseded before failure', params.receiptLease.id);
    return false;
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'webhook.failed',
      entityType: 'webhook_event',
      entityId: params.receiptLease.id,
      tenantId: params.tenantId || undefined,
      metadata: {
        provider: 'paddle',
        eventType: params.eventType,
        eventId: params.eventId,
        result: 'error',
        error: message,
      },
      headers: params.headers,
    });
  }
  return true;
}
