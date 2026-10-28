import { dbAdmin } from '@interdomestik/database';
import type { BillingEntity } from '@interdomestik/domain-membership-billing/paddle-server';
import {
  parsePaddleWebhookBody,
  sha256Hex,
  verifyPaddleWebhook,
  type PaddleWebhookIdentityReader,
} from '@interdomestik/domain-membership-billing/paddle-webhooks';
import type { Paddle } from '@paddle/paddle-node-sdk';
import { bindPaddleReceiptStore } from './bound-receipt-store';

type Envelope = {
  paddle: Paddle;
  body: string;
  signature: string;
  secret: string;
  billingEntity?: BillingEntity;
};
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function dataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Verifies raw bytes before creating any canonical identity lookup capability. */
export async function verifyPaddleBoundary(args: Envelope) {
  const parsed = parsePaddleWebhookBody(args.body);
  const verified = await verifyPaddleWebhook({ ...args, parsedPayload: parsed.parsedPayload });
  const event = dataRecord(verified.eventData);
  const data = dataRecord(event.data);
  const customData = dataRecord(data.custom_data ?? data.customData);
  const refs = [
    ...new Set(
      [data.subscriptionId, data.subscription_id, data.id]
        .map(text)
        .filter((v): v is string => v !== null)
    ),
  ];
  const allowedUsers = new Set<string>();
  const claimedUser = text(customData.userId);
  if (claimedUser) allowedUsers.add(claimedUser);
  type Subscription = Awaited<ReturnType<PaddleWebhookIdentityReader['subscription']>>;
  const subscriptions = new Map<string, Subscription>();
  let canonicalSubscription: Subscription = null;
  let loaded: Promise<void> | undefined;
  function loadSubscriptions() {
    loaded ??= (async () => {
      for (const reference of refs) {
        const rows = await dbAdmin.query.subscriptions.findMany({
          limit: 2,
          where: (table, { eq, or }) =>
            or(eq(table.id, reference), eq(table.providerSubscriptionId, reference)),
          columns: {
            id: true,
            status: true,
            tenantId: true,
            userId: true,
            providerSubscriptionId: true,
            legalTenantId: true,
            billingEntity: true,
          },
        });
        if (rows.length > 1) throw new Error('Ambiguous stored Paddle subscription reference');
        const row = rows[0] ?? null;
        subscriptions.set(reference, row);
        if (!row) continue;
        if (
          canonicalSubscription &&
          (canonicalSubscription.id !== row.id ||
            canonicalSubscription.tenantId !== row.tenantId ||
            canonicalSubscription.userId !== row.userId)
        ) {
          throw new Error('Conflicting stored Paddle subscription bindings');
        }
        canonicalSubscription = row;
      }
      if (canonicalSubscription?.userId) allowedUsers.add(canonicalSubscription.userId);
    })();
    return loaded;
  }
  const identityReader: PaddleWebhookIdentityReader = {
    async subscription(reference) {
      const normalized = text(reference);
      if (!normalized || !refs.includes(normalized))
        throw new Error('Paddle reference outside signed envelope');
      await loadSubscriptions();
      return structuredClone(subscriptions.get(normalized)!);
    },
    async user(userId) {
      await loadSubscriptions();
      if (
        !allowedUsers.has(userId) ||
        (canonicalSubscription?.userId && userId !== canonicalSubscription.userId)
      )
        throw new Error('Paddle user conflicts with signed identity binding');
      return (
        (await dbAdmin.query.user.findFirst({
          where: (table, { eq }) => eq(table.id, userId),
          columns: { tenantId: true, email: true, name: true, memberNumber: true, agentId: true },
        })) ?? null
      );
    },
  };
  return {
    ...verified,
    identityReader,
    async receiptStore(tenantId: string | null) {
      let canonicalTenant: string | null = null;
      for (const reference of refs) {
        const subscription = await identityReader.subscription(reference);
        if (subscription?.tenantId) {
          canonicalTenant = subscription.tenantId;
          break;
        }
      }
      if (!canonicalTenant && claimedUser)
        canonicalTenant = (await identityReader.user(claimedUser))?.tenantId ?? null;
      if (tenantId !== canonicalTenant) throw new Error('Paddle receipt tenant is not canonical');
      return receiptFor(
        args,
        parsed,
        event,
        canonicalTenant,
        verified.signatureValid || verified.signatureBypassed
      );
    },
  };
}

/** Invalid signatures can only acquire an invalid, null-tenant receipt writer. */
export async function invalidPaddleReceiptStore(args: Envelope) {
  const parsed = parsePaddleWebhookBody(args.body);
  try {
    await verifyPaddleWebhook({ ...args, parsedPayload: parsed.parsedPayload });
  } catch {
    return receiptFor(args, parsed, {}, null, false);
  }
  throw new Error('A verified event cannot use the invalid-signature receipt capability');
}

function receiptFor(
  args: Envelope,
  parsed: ReturnType<typeof parsePaddleWebhookBody>,
  verifiedEvent: Record<string, unknown>,
  tenantId: string | null,
  signatureValid: boolean
) {
  const eventType = (verifiedEvent.eventType ?? parsed.eventTypeFromPayload ?? null) as
    string | null;
  const eventId = text(
    verifiedEvent.eventId ?? verifiedEvent.event_id ?? parsed.eventIdFromPayload
  );
  const payloadHash = sha256Hex(args.body);
  const processingScopeKey = args.billingEntity
    ? `entity:${args.billingEntity}`
    : tenantId
      ? `tenant:${tenantId}`
      : 'global';
  const data = dataRecord(verifiedEvent.data);
  const providerTransactionId = eventType?.startsWith('transaction.')
    ? text(data.id) || text(data.transactionId) || text(data.transaction_id)
    : null;
  return bindPaddleReceiptStore({
    tenantId,
    provider: 'paddle',
    processingScopeKey,
    dedupeKey: eventId
      ? `paddle:${processingScopeKey}:event:${eventId}`
      : `paddle:${processingScopeKey}:sha256:${payloadHash}`,
    eventType,
    eventId,
    ...(signatureValid ? { providerTransactionId } : {}),
    signatureValid,
    eventTimestamp: parsed.eventTimestampFromPayload,
    payloadHash,
    payload: parsed.parsedPayload,
  });
}
