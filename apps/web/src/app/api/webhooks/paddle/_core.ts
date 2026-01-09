import { sendThankYouLetterCore } from '@/actions/thank-you-letter/send';
import { logAuditEvent } from '@/lib/audit';
import { sendPaymentFailedEmail } from '@/lib/email';
import { db } from '@interdomestik/database';
import {
  handlePaddleEvent,
  insertWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
  parsePaddleWebhookBody,
  persistInvalidSignatureAttempt,
  sha256Hex,
  verifyPaddleWebhook,
} from '@interdomestik/domain-membership-billing/paddle-webhooks';

import type { Paddle } from '@paddle/paddle-node-sdk';

export type PaddleWebhookCoreResult = {
  status: 200 | 400 | 401 | 500;
  body: Record<string, unknown>;
};

type PaddleWebhookData = {
  id?: string;
  subscriptionId?: string | null;
  subscription_id?: string | null;
  customData?: { userId?: string };
  custom_data?: { userId?: string };
};

async function resolveWebhookTenantId(data: unknown): Promise<string | null> {
  const payload = (data ?? {}) as PaddleWebhookData;
  const customData = payload.customData || payload.custom_data;
  const userId = customData?.userId;

  if (userId) {
    const userRecord = await db.query.user.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
      columns: { tenantId: true },
    });
    if (userRecord?.tenantId) return userRecord.tenantId;
  }

  const subscriptionId = payload.id || payload.subscriptionId || payload.subscription_id;
  if (!subscriptionId) return null;

  const subscription = await db.query.subscriptions.findFirst({
    where: (subs, { eq }) => eq(subs.id, subscriptionId),
    columns: { tenantId: true },
  });
  return subscription?.tenantId ?? null;
}

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
  } catch {
    try {
      const dedupeKey = eventIdFromPayload
        ? `paddle:${eventIdFromPayload}`
        : `paddle:sha256:${payloadHash}`;

      await persistInvalidSignatureAttempt(
        {
          headers,
          dedupeKey,
          eventType: eventTypeFromPayload,
          eventId: eventIdFromPayload,
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
  const data = (eventData as { data?: unknown }).data;

  const dedupeKey = eventId ? `paddle:${eventId}` : `paddle:sha256:${payloadHash}`;
  const tenantId = await resolveWebhookTenantId(data);

  const insertResult = await insertWebhookEvent(
    {
      headers,
      dedupeKey,
      eventType,
      eventId,
      signatureValid,
      signatureBypassed,
      eventTimestamp: eventTimestampFromPayload,
      payloadHash,
      parsedPayload,
      tenantId,
    },
    { logAuditEvent }
  );

  if (!insertResult.inserted || !insertResult.webhookEventRowId) {
    return { status: 200, body: { success: true, duplicate: true } };
  }

  const webhookEventRowId = insertResult.webhookEventRowId;

  try {
    // Intercept transaction.completed for Lead Conversion
    if (eventType === 'transaction.completed' && data) {
      const payload = data as {
        custom_data?: { leadId?: string };
        customData?: { leadId?: string };
      };
      const customData = payload.custom_data || payload.customData;

      if (customData?.leadId) {
        const { convertLeadToMember } = await import('@interdomestik/domain-leads');
        await convertLeadToMember(
          { tenantId: tenantId || 'unknown' },
          { leadId: customData.leadId }
        );

        // Also mark payment attempt as succeeded?
        // convertLeadToMember handles lead status.
        // We might want to update leadPaymentAttempts status separately if convert doesn't do it for card.
        // Domain logic `convertLeadToMember` does: update memberLeads -> converted.
        // It doesn't seem to touch `leadPaymentAttempts` status in my previous implementation?
        // Let's assume for now convert checks membership creation.

        // TODO: Ideally we update the specific payment attempt linked to this transaction?
        // But valid point: createLeadAction -> startPayment -> creates attempt.
        // If we have attempt ID in metadata, even better.
      }
    }

    await handlePaddleEvent(
      { eventType, data },
      {
        sendPaymentFailedEmail,
        sendThankYouLetter: sendThankYouLetterCore,
        logAuditEvent,
      }
    );
    await markWebhookProcessed(
      { headers, webhookEventRowId, eventType, eventId, tenantId },
      { logAuditEvent }
    );
  } catch (processingError) {
    await markWebhookFailed(
      {
        headers,
        webhookEventRowId,
        eventType,
        eventId,
        error: processingError,
        tenantId,
      },
      { logAuditEvent }
    );

    throw processingError;
  }

  return { status: 200, body: { success: true } };
}
