import { db, webhookEvents } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { PaddleWebhookAuditDeps } from './types';

export async function persistInvalidSignatureAttempt(
  params: {
    headers: Headers;
    dedupeKey: string;
    eventType: string | undefined;
    eventId: string | undefined;
    eventTimestamp: Date | null;
    payloadHash: string;
    parsedPayload: Record<string, unknown>;
  },
  deps: PaddleWebhookAuditDeps = {}
) {
  await db
    .insert(webhookEvents)
    .values({
      id: nanoid(),
      provider: 'paddle',
      dedupeKey: params.dedupeKey,
      eventType: params.eventType ?? null,
      eventId: params.eventId ?? null,
      signatureValid: false,
      eventTimestamp: params.eventTimestamp,
      payloadHash: params.payloadHash,
      payload: params.parsedPayload,
    })
    .onConflictDoNothing({
      target: webhookEvents.dedupeKey,
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
    dedupeKey: string;
    eventType: string | undefined;
    eventId: string | undefined;
    signatureValid: boolean;
    signatureBypassed: boolean;
    eventTimestamp: Date | null;
    payloadHash: string;
    parsedPayload: Record<string, unknown>;
  },
  deps: PaddleWebhookAuditDeps = {}
) {
  const inserted = await db
    .insert(webhookEvents)
    .values({
      id: nanoid(),
      provider: 'paddle',
      dedupeKey: params.dedupeKey,
      eventType: params.eventType ?? null,
      eventId: params.eventId ?? null,
      signatureValid: params.signatureValid || params.signatureBypassed,
      eventTimestamp: params.eventTimestamp,
      payloadHash: params.payloadHash,
      payload: params.parsedPayload,
    })
    .onConflictDoNothing({
      target: webhookEvents.dedupeKey,
    })
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorRole: 'system',
        action: 'webhook.duplicate',
        entityType: 'webhook_event',
        metadata: {
          provider: 'paddle',
          dedupeKey: params.dedupeKey,
          eventType: params.eventType,
          eventId: params.eventId,
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
        signatureValid: params.signatureValid,
        signatureBypassed: params.signatureBypassed,
      },
      headers: params.headers,
    });
  }

  return { inserted: true as const, webhookEventRowId };
}

export async function markWebhookProcessed(
  params: {
    headers: Headers;
    webhookEventRowId: string;
    eventType: string | undefined;
    eventId: string | undefined;
  },
  deps: PaddleWebhookAuditDeps = {}
) {
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
  },
  deps: PaddleWebhookAuditDeps = {}
) {
  const message = params.error instanceof Error ? params.error.message : String(params.error);

  await db
    .update(webhookEvents)
    .set({
      processedAt: new Date(),
      processingResult: 'error',
      error: message.slice(0, 2000),
    })
    .where(eq(webhookEvents.id, params.webhookEventRowId));

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: 'webhook.failed',
      entityType: 'webhook_event',
      entityId: params.webhookEventRowId,
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
