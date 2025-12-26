import {
  handlePaddleEvent,
  insertWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
  parsePaddleWebhookBody,
  persistInvalidSignatureAttempt,
  sha256Hex,
  verifyPaddleWebhook,
} from '@/lib/paddle-webhooks';

import type { Paddle } from '@paddle/paddle-node-sdk';

export type PaddleWebhookCoreResult = {
  status: 200 | 400 | 401 | 500;
  body: Record<string, unknown>;
};

export async function handlePaddleWebhookCore(args: {
  paddle: Paddle;
  headers: Headers;
  signature: string | null;
  secret: string | undefined;
  bodyText: string;
}): Promise<PaddleWebhookCoreResult> {
  const { paddle, headers, signature, secret, bodyText } = args;

  if (!signature || !secret) {
    return { status: 400, body: { error: 'Missing signature or secret' } };
  }

  const payloadHash = sha256Hex(bodyText);
  const { parsedPayload, eventTypeFromPayload, eventIdFromPayload, eventTimestampFromPayload } =
    parsePaddleWebhookBody(bodyText);

  let verified: Awaited<ReturnType<typeof verifyPaddleWebhook>>;
  try {
    verified = await verifyPaddleWebhook({
      paddle,
      body: bodyText,
      secret,
      signature,
      parsedPayload,
    });
  } catch (unmarshalError) {
    try {
      const dedupeKey = eventIdFromPayload
        ? `paddle:${eventIdFromPayload}`
        : `paddle:sha256:${payloadHash}`;

      await persistInvalidSignatureAttempt({
        headers,
        dedupeKey,
        eventType: eventTypeFromPayload,
        eventId: eventIdFromPayload,
        eventTimestamp: eventTimestampFromPayload,
        payloadHash,
        parsedPayload,
      });
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
  const data = (eventData as { data?: unknown }).data;

  const dedupeKey = eventId ? `paddle:${eventId}` : `paddle:sha256:${payloadHash}`;

  const insertResult = await insertWebhookEvent({
    headers,
    dedupeKey,
    eventType,
    eventId,
    signatureValid,
    signatureBypassed,
    eventTimestamp: eventTimestampFromPayload,
    payloadHash,
    parsedPayload,
  });

  if (!insertResult.inserted || !insertResult.webhookEventRowId) {
    return { status: 200, body: { success: true, duplicate: true } };
  }

  const webhookEventRowId = insertResult.webhookEventRowId;

  try {
    await handlePaddleEvent({ eventType, data });
    await markWebhookProcessed({ headers, webhookEventRowId, eventType, eventId });
  } catch (processingError) {
    await markWebhookFailed({
      headers,
      webhookEventRowId,
      eventType,
      eventId,
      error: processingError,
    });

    throw processingError;
  }

  return { status: 200, body: { success: true } };
}
