import { db, webhookEvents } from '@interdomestik/database';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { PaddleWebhookAuditDeps } from './types';

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
    tenantId?: string | null;
  },
  deps: PaddleWebhookAuditDeps = {}
) {
  // db-access-guard: system-exempt -- reason: Paddle invalid-signature audit must persist before safe tenant resolution and allows tenantId null
  await db
    .insert(webhookEvents)
    .values({
      id: nanoid(),
      tenantId: params.tenantId ?? null,
      provider: 'paddle',
      processingScopeKey: params.processingScopeKey,
      dedupeKey: params.dedupeKey,
      eventType: params.eventType ?? null,
      eventId: params.eventId ?? null,
      signatureValid: false,
      eventTimestamp: params.eventTimestamp,
      payloadHash: params.payloadHash,
      payload: params.parsedPayload,
    })
    .onConflictDoNothing();

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
  // db-access-guard: system-exempt -- reason: Paddle webhook receipt audit preserves duplicate detection before handler-level tenant writes
  const inserted = await db
    .insert(webhookEvents)
    .values({
      id: nanoid(),
      tenantId: params.tenantId ?? null,
      provider: 'paddle',
      processingScopeKey: params.processingScopeKey,
      dedupeKey: params.dedupeKey,
      eventType: params.eventType ?? null,
      eventId: params.eventId ?? null,
      providerTransactionId: params.providerTransactionId ?? null,
      signatureValid: params.signatureValid || params.signatureBypassed,
      eventTimestamp: params.eventTimestamp,
      payloadHash: params.payloadHash,
      payload: params.parsedPayload,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    const reclaimed = await reclaimRetryableWebhookEvent(params);
    if (reclaimed) {
      if (deps.logAuditEvent) {
        await deps.logAuditEvent({
          actorRole: 'system',
          action: 'webhook.retry_received',
          entityType: 'webhook_event',
          entityId: reclaimed.id,
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

      return { inserted: true as const, webhookEventRowId: reclaimed.id };
    }

    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorRole: 'system',
        action: 'webhook.duplicate',
        entityType: 'webhook_event',
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

  const webhookEventRowId = inserted[0]!.id;

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'webhook.received',
      entityType: 'webhook_event',
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
      headers: params.headers,
    });
  }

  return { inserted: true as const, webhookEventRowId };
}

async function reclaimRetryableWebhookEvent(params: {
  eventType: string | undefined;
  processingScopeKey: string;
  dedupeKey: string;
  payloadHash: string;
}) {
  const leaseStartedAt = new Date();
  const staleBefore = new Date(leaseStartedAt.getTime() - 5 * 60 * 1000);
  // db-access-guard: system-exempt -- reason: compare-and-set reclaims only the exact verified failed receipt or a stale subscription-created lease.
  const reclaimed = await db
    .update(webhookEvents)
    .set({
      receivedAt: leaseStartedAt,
      processedAt: null,
      processingResult: null,
      error: null,
    })
    .where(
      and(
        eq(webhookEvents.dedupeKey, params.dedupeKey),
        eq(webhookEvents.processingScopeKey, params.processingScopeKey),
        eq(webhookEvents.payloadHash, params.payloadHash),
        eq(webhookEvents.signatureValid, true),
        or(
          eq(webhookEvents.processingResult, 'retryable_error'),
          and(
            eq(webhookEvents.eventType, 'subscription.created'),
            eq(webhookEvents.eventType, params.eventType ?? ''),
            isNull(webhookEvents.processingResult),
            lt(webhookEvents.receivedAt, staleBefore)
          )
        )
      )
    )
    .returning({ id: webhookEvents.id });

  return reclaimed[0] ?? null;
}

export async function markWebhookProcessed(
  params: {
    headers: Headers;
    webhookEventRowId: string;
    eventType: string | undefined;
    eventId: string | undefined;
    tenantId?: string | null;
  },
  deps: PaddleWebhookAuditDeps = {}
) {
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  await db
    .update(webhookEvents)
    .set({
      processedAt: new Date(),
      processingResult: 'ok',
      error: null,
    })
    .where(eq(webhookEvents.id, params.webhookEventRowId));

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'webhook.processed',
      entityType: 'webhook_event',
      entityId: params.webhookEventRowId,
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
}

export async function markWebhookFailed(
  params: {
    headers: Headers;
    webhookEventRowId: string;
    eventType: string | undefined;
    eventId: string | undefined;
    error: unknown;
    retryable?: boolean;
    tenantId?: string | null;
  },
  deps: PaddleWebhookAuditDeps = {}
) {
  const message = params.error instanceof Error ? params.error.message : String(params.error);

  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  await db
    .update(webhookEvents)
    .set({
      processedAt: new Date(),
      processingResult: params.retryable ? 'retryable_error' : 'error',
      error: message.slice(0, 2000),
    })
    .where(eq(webhookEvents.id, params.webhookEventRowId));

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'webhook.failed',
      entityType: 'webhook_event',
      entityId: params.webhookEventRowId,
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
}
