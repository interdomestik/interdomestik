import { sendThankYouLetterCore } from '@/actions/thank-you-letter/send';
import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { sendPaymentFailedEmail } from '@/lib/email';
import {
  coerceTenantId,
  preferredLocaleForTenant,
  resolveDefaultPublicTenantId,
  resolveTenantAppOrigin,
} from '@/lib/tenant/tenant-hosts';
import { db } from '@interdomestik/database';
import type { BillingEntity } from '@interdomestik/domain-membership-billing/paddle-server';
import { findSubscriptionByProviderReference } from '@interdomestik/domain-membership-billing/subscription';
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

import type { Paddle } from '@paddle/paddle-node-sdk';

export type PaddleWebhookCoreResult = {
  status: 200 | 400 | 401 | 500;
  body: Record<string, unknown>;
};

type PaddleWebhookData = {
  id?: string;
  subscriptionId?: string | null;
  subscription_id?: string | null;
  customData?: { userId?: string; tenantId?: string; leadId?: unknown };
  custom_data?: { userId?: string; tenantId?: string; leadId?: unknown };
};

type PaddleTransactionData = {
  id?: string;
  transactionId?: string;
  transaction_id?: string;
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

const PADDLE_LEAD_ID_PATTERN = /^[A-Za-z0-9_:-]{1,128}$/;

function normalizePaddleLeadId(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const leadId = normalizeText(value);
  if (!leadId || !PADDLE_LEAD_ID_PATTERN.test(leadId)) return null;

  return leadId;
}

function getPaddleLeadId(data: unknown): string | null {
  return normalizePaddleLeadId(getPaddleCustomData(data)?.leadId);
}

function getPaddleCustomData(data: unknown): PaddleWebhookData['customData'] | undefined {
  if (!data || typeof data !== 'object') return undefined;

  const payload = data as PaddleWebhookData;
  return payload.custom_data ?? payload.customData;
}

function getPaddleSubscriptionReferences(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];

  const payload = data as PaddleWebhookData;
  return [
    normalizeText(payload.subscriptionId),
    normalizeText(payload.subscription_id),
    normalizeText(payload.id),
  ].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index
  );
}

type WebhookSubscription = NonNullable<
  Awaited<ReturnType<typeof findSubscriptionByProviderReference>>
>;

async function resolveWebhookSubscription(data: unknown): Promise<WebhookSubscription | null> {
  for (const subscriptionReference of getPaddleSubscriptionReferences(data)) {
    const subscription = await findSubscriptionByProviderReference(subscriptionReference);
    if (subscription?.tenantId) return subscription;
  }

  return null;
}

function hasLeadConversionProviderConflict(params: {
  data: unknown;
  tenantId: string;
  subscription: WebhookSubscription | null;
}): boolean {
  const customData = getPaddleCustomData(params.data);
  const providerUserId = normalizeText(customData?.userId);
  const providerTenantId = normalizeText(customData?.tenantId);
  const subscriptionTenantId = normalizeText(params.subscription?.tenantId);
  const subscriptionUserId = normalizeText(params.subscription?.userId);

  if (providerTenantId && providerTenantId !== params.tenantId) return true;
  if (subscriptionTenantId && subscriptionTenantId !== params.tenantId) return true;
  if (params.subscription && providerUserId && !subscriptionUserId) return true;
  if (subscriptionUserId && providerUserId && subscriptionUserId !== providerUserId) return true;

  return false;
}

async function reconcilePaddleLeadConversion(params: {
  eventType: string | undefined;
  data: unknown;
  tenantId: string | null;
  subscription: WebhookSubscription | null;
}): Promise<void> {
  if (params.eventType !== 'transaction.completed' || !params.tenantId) return;

  const leadId = getPaddleLeadId(params.data);
  if (!leadId) return;

  if (
    hasLeadConversionProviderConflict({
      data: params.data,
      tenantId: params.tenantId,
      subscription: params.subscription,
    })
  ) {
    return;
  }

  const { convertLeadToMember, hasTenantLeadForConversion } =
    await import('@interdomestik/domain-leads');

  const leadBelongsToTenant = await hasTenantLeadForConversion(
    { tenantId: params.tenantId },
    { leadId }
  );
  if (!leadBelongsToTenant) return;

  await convertLeadToMember({ tenantId: params.tenantId }, { leadId });
}

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

export function buildTenantPasswordResetRedirectUrl(tenantId: string): string {
  const normalizedTenantId = coerceTenantId(tenantId) ?? resolveDefaultPublicTenantId();
  const origin = resolveTenantAppOrigin(normalizedTenantId);
  const locale = preferredLocaleForTenant(normalizedTenantId);
  return new URL(`/${locale}/reset-password`, origin).toString();
}

export async function requestPasswordResetOnboarding(params: {
  email: string;
  tenantId: string;
}): Promise<void> {
  await auth.api.requestPasswordReset({
    body: {
      email: params.email,
      redirectTo: buildTenantPasswordResetRedirectUrl(params.tenantId),
    },
  });
}

async function resolveWebhookTenantId(
  data: unknown,
  subscription: WebhookSubscription | null
): Promise<string | null> {
  const customData = getPaddleCustomData(data);

  if (subscription?.tenantId) return subscription.tenantId;

  const userId = normalizeText(customData?.userId);
  if (userId) {
    // db-access-guard: system-exempt -- reason: Paddle customData userId is a fallback only after canonical subscription lookup cannot resolve tenant
    const userRecord = await db.query.user.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
      columns: { tenantId: true },
    });
    if (userRecord?.tenantId) return userRecord.tenantId;
  }

  return null;
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

  const subscription = await resolveWebhookSubscription(data);
  const tenantId = await resolveWebhookTenantId(data, subscription);
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
    },
    { logAuditEvent }
  );

  if (!insertResult.inserted || !insertResult.webhookEventRowId) {
    return { status: 200, body: { success: true, duplicate: true } };
  }

  const webhookEventRowId = insertResult.webhookEventRowId;

  try {
    await persistInvoiceAndLedgerInvariants(
      {
        headers,
        webhookEventRowId,
        eventType,
        eventId: normalizedEventId ?? undefined,
        tenantId,
        billingEntity: billingEntity ?? null,
        providerTransactionId,
        data,
      },
      { logAuditEvent }
    );

    await reconcilePaddleLeadConversion({ eventType, data, tenantId, subscription });

    await handlePaddleEvent(
      { eventType, data },
      {
        sendPaymentFailedEmail,
        sendThankYouLetter: sendThankYouLetterCore,
        requestPasswordResetOnboarding,
        logAuditEvent,
      }
    );
    await markWebhookProcessed(
      { headers, webhookEventRowId, eventType, eventId: normalizedEventId ?? undefined, tenantId },
      { logAuditEvent }
    );
  } catch (processingError) {
    await markWebhookFailed(
      {
        headers,
        webhookEventRowId,
        eventType,
        eventId: normalizedEventId ?? undefined,
        error: processingError,
        tenantId,
      },
      { logAuditEvent }
    );

    throw processingError;
  }

  return { status: 200, body: { success: true } };
}
