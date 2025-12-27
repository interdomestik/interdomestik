import {
  insertWebhookEvent as insertWebhookEventCore,
  markWebhookFailed as markWebhookFailedCore,
  markWebhookProcessed as markWebhookProcessedCore,
  persistInvalidSignatureAttempt as persistInvalidSignatureAttemptCore,
} from '@interdomestik/domain-membership-billing/paddle-webhooks/persist';

import { logAuditEvent } from '@/lib/audit';

export async function persistInvalidSignatureAttempt(params: {
  headers: Headers;
  dedupeKey: string;
  eventType: string | undefined;
  eventId: string | undefined;
  eventTimestamp: Date | null;
  payloadHash: string;
  parsedPayload: Record<string, unknown>;
}) {
  return persistInvalidSignatureAttemptCore(params, { logAuditEvent });
}

export async function insertWebhookEvent(params: {
  headers: Headers;
  dedupeKey: string;
  eventType: string | undefined;
  eventId: string | undefined;
  signatureValid: boolean;
  signatureBypassed: boolean;
  eventTimestamp: Date | null;
  payloadHash: string;
  parsedPayload: Record<string, unknown>;
}) {
  return insertWebhookEventCore(params, { logAuditEvent });
}

export async function markWebhookProcessed(params: {
  headers: Headers;
  webhookEventRowId: string;
  eventType: string | undefined;
  eventId: string | undefined;
}) {
  return markWebhookProcessedCore(params, { logAuditEvent });
}

export async function markWebhookFailed(params: {
  headers: Headers;
  webhookEventRowId: string;
  eventType: string | undefined;
  eventId: string | undefined;
  error: unknown;
}) {
  return markWebhookFailedCore(params, { logAuditEvent });
}
