import type { PaddleWebhookIdentityReader } from '@interdomestik/domain-membership-billing/paddle-webhooks';

type PaddleWebhookData = {
  id?: string;
  subscriptionId?: string | null;
  subscription_id?: string | null;
  customData?: { userId?: string; tenantId?: string; leadId?: unknown };
  custom_data?: { userId?: string; tenantId?: string; leadId?: unknown };
};
function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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

export type WebhookSubscription = NonNullable<
  Awaited<ReturnType<PaddleWebhookIdentityReader['subscription']>>
>;

export async function resolveWebhookSubscription(
  data: unknown,
  identityReader: PaddleWebhookIdentityReader
): Promise<WebhookSubscription | null> {
  for (const subscriptionReference of getPaddleSubscriptionReferences(data)) {
    const subscription = await identityReader.subscription(subscriptionReference);
    if (subscription?.tenantId) return subscription;
  }

  return null;
}

export async function resolveWebhookTenantId(
  data: unknown,
  subscription: WebhookSubscription | null,
  identityReader: PaddleWebhookIdentityReader
): Promise<string | null> {
  const customData = getPaddleCustomData(data);

  if (subscription?.tenantId) return subscription.tenantId;

  const userId = normalizeText(customData?.userId);
  if (userId) {
    // db-access-guard: system-exempt -- reason: Paddle customData userId is a fallback only after canonical subscription lookup cannot resolve tenant
    const userRecord = await identityReader.user(userId);
    if (userRecord?.tenantId) return userRecord.tenantId;
  }

  return null;
}
