import { resolvePaddleUserOwner } from '@interdomestik/database';
import { findSubscriptionByProviderReference } from '@interdomestik/domain-membership-billing/subscription';
import { isPaddleSubscriptionReferenceAmbiguousError } from '@interdomestik/domain-membership-billing/paddle-webhooks/persist';

type PaddleWebhookData = {
  id?: string;
  subscriptionId?: string | null;
  subscription_id?: string | null;
  customData?: { userId?: string; tenantId?: string; leadId?: unknown };
  custom_data?: { userId?: string; tenantId?: string; leadId?: unknown };
};

export function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getPaddleCustomData(data: unknown): PaddleWebhookData['customData'] | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const payload = data as PaddleWebhookData;
  return payload.custom_data ?? payload.customData;
}

export function getPaddleSubscriptionReferences(data: unknown): string[] {
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
  Awaited<ReturnType<typeof findSubscriptionByProviderReference>>
>;

export type WebhookSubscriptionResolution = WebhookSubscription | 'ambiguous' | null;

export async function resolveWebhookSubscription(
  data: unknown
): Promise<WebhookSubscriptionResolution> {
  for (const subscriptionReference of getPaddleSubscriptionReferences(data)) {
    let subscription: Awaited<ReturnType<typeof findSubscriptionByProviderReference>>;
    try {
      subscription = await findSubscriptionByProviderReference(subscriptionReference);
    } catch (error) {
      // The receipt is still admitted (tenant unresolved) so processing records the terminal
      // conflict; no later reference or customData may stand in for an ambiguous one.
      if (isPaddleSubscriptionReferenceAmbiguousError(error)) return 'ambiguous';
      throw error;
    }
    if (subscription?.tenantId) return subscription;
  }

  return null;
}

export async function resolveWebhookTenantId(
  data: unknown,
  subscription: WebhookSubscriptionResolution
): Promise<string | null> {
  if (subscription === 'ambiguous') return null;
  const customData = getPaddleCustomData(data);

  if (subscription?.tenantId) return subscription.tenantId;

  const userId = normalizeText(customData?.userId);
  if (userId) {
    // Fallback after canonical subscription lookup: exact user id to owning tenant only.
    const owner = await resolvePaddleUserOwner(userId);
    if (owner) return owner.tenantId;
  }

  return null;
}
