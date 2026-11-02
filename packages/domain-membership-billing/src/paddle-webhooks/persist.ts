import {
  admitVerifiedPaddleReceipt,
  appendPaddleInvalidSignatureEvidence,
  completePaddleReceiptLease,
  type PaddleReceiptLease,
} from '@interdomestik/database';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

import { RetryablePaddleWebhookError } from './errors';
import type { PaddleWebhookAuditDeps } from './types';

export type { PaddleReceiptLease } from '@interdomestik/database';

export {
  PaddleSubscriptionReferenceAmbiguousError,
  isPaddleSubscriptionReferenceAmbiguousError,
  isRetryablePaddleWebhookError,
} from './errors';

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
  // Accepted for call-site compatibility. The delivery failed verification before any tenant was
  // known, so there is no tenant to record an audit row in; the receipt evidence is the record.
  _deps: PaddleWebhookAuditDeps = {}
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
}

type ReceiptAuditEntry = Pick<
  Parameters<NonNullable<PaddleWebhookAuditDeps['logAuditEvent']>>[0],
  'action' | 'entityId' | 'metadata'
>;

/** Records a system receipt audit row under the receipt tenant, when an audit sink and tenant exist. */
async function auditReceipt(
  deps: PaddleWebhookAuditDeps,
  params: { headers: Headers; authority?: TenantAuthority | null },
  entry: ReceiptAuditEntry
): Promise<void> {
  if (!deps.logAuditEvent || !params.authority) return;
  await deps.logAuditEvent({
    actorRole: 'system',
    action: entry.action,
    entityType: 'webhook_event',
    ...(entry.entityId === undefined ? {} : { entityId: entry.entityId }),
    authority: params.authority,
    metadata: entry.metadata,
    headers: params.headers,
  });
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
    /** Authority of the tenant the receipt belongs to, when one was resolved. */
    authority?: TenantAuthority | null;
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
    await auditReceipt(deps, params, {
      action: 'webhook.retry_received',
      entityId: receiptLease.id,
      metadata: {
        provider: 'paddle',
        dedupeKey: params.dedupeKey,
        processingScopeKey: params.processingScopeKey,
        eventType: params.eventType,
        eventId: params.eventId,
      },
    });

    return { inserted: true as const, webhookEventRowId: receiptLease.id, receiptLease };
  }

  if (admission.outcome === 'in_progress') {
    await auditReceipt(deps, params, {
      action: 'webhook.retry_deferred',
      entityId: admission.receiptId,
      metadata: {
        provider: 'paddle',
        dedupeKey: params.dedupeKey,
        processingScopeKey: params.processingScopeKey,
        eventType: params.eventType,
        eventId: params.eventId,
      },
    });
    throw new RetryablePaddleWebhookError(
      `Paddle webhook ${params.eventId ?? params.dedupeKey} is still processing`
    );
  }

  if (admission.outcome === 'duplicate') {
    await auditReceipt(deps, params, {
      action: 'webhook.duplicate',
      metadata: {
        provider: 'paddle',
        dedupeKey: params.dedupeKey,
        processingScopeKey: params.processingScopeKey,
        eventType: params.eventType,
        eventId: params.eventId,
        providerTransactionId: params.providerTransactionId ?? null,
        signatureBypassed: params.signatureBypassed,
      },
    });

    return { inserted: false as const, webhookEventRowId: null };
  }

  const receiptLease = admission.lease;
  const webhookEventRowId = receiptLease.id;

  await auditReceipt(deps, params, {
    action: 'webhook.received',
    entityId: webhookEventRowId,
    metadata: {
      provider: 'paddle',
      eventType: params.eventType,
      eventId: params.eventId,
      processingScopeKey: params.processingScopeKey,
      providerTransactionId: params.providerTransactionId ?? null,
      signatureValid: params.signatureValid,
      signatureBypassed: params.signatureBypassed,
    },
  });

  return { inserted: true as const, webhookEventRowId, receiptLease };
}

export async function markWebhookProcessed(
  params: {
    headers: Headers;
    receiptLease: PaddleReceiptLease;
    eventType: string | undefined;
    eventId: string | undefined;
    tenantId?: string | null;
    authority?: TenantAuthority | null;
  },
  deps: PaddleWebhookAuditDeps = {}
): Promise<boolean> {
  const completed = await completePaddleReceiptLease(params.receiptLease, { result: 'ok' });
  if (!completed) {
    console.warn('[Paddle] Receipt lease was superseded before completion', params.receiptLease.id);
    return false;
  }

  await auditReceipt(deps, params, {
    action: 'webhook.processed',
    entityId: params.receiptLease.id,
    metadata: {
      provider: 'paddle',
      eventType: params.eventType,
      eventId: params.eventId,
      result: 'ok',
    },
  });
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
    authority?: TenantAuthority | null;
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

  await auditReceipt(deps, params, {
    action: 'webhook.failed',
    entityId: params.receiptLease.id,
    metadata: {
      provider: 'paddle',
      eventType: params.eventType,
      eventId: params.eventId,
      result: 'error',
      error: message,
    },
  });
  return true;
}
