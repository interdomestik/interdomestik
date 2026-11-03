import { authorizePaddleTenant, resolvePaddleUserOwner } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import {
  findPaddleSubscriptionByReference,
  type PaddleSubscriptionLookup,
} from '@interdomestik/domain-membership-billing/subscription';
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

export type WebhookSubscription = PaddleSubscriptionLookup['subscription'];

/** A resolved subscription together with the authority it was read under. */
export type WebhookSubscriptionLookup = PaddleSubscriptionLookup;

export type WebhookSubscriptionResolution = WebhookSubscriptionLookup | 'ambiguous' | null;

export type WebhookTenantResolution = {
  tenantId: string;
  /** `paddle-webhook` authority minted from the resolver owner that named this tenant. */
  authority: TenantAuthority;
};

export async function resolveWebhookSubscription(
  delivery: IngressCapability<'paddle-delivery'>,
  data: unknown
): Promise<WebhookSubscriptionResolution> {
  for (const subscriptionReference of getPaddleSubscriptionReferences(data)) {
    let lookup: PaddleSubscriptionLookup | null;
    try {
      lookup = await findPaddleSubscriptionByReference(subscriptionReference, delivery);
    } catch (error) {
      // The receipt is still admitted (tenant unresolved) so processing records the terminal
      // conflict; no later reference or customData may stand in for an ambiguous one.
      if (isPaddleSubscriptionReferenceAmbiguousError(error)) return 'ambiguous';
      throw error;
    }
    if (lookup?.subscription.tenantId) return lookup;
  }

  return null;
}

export async function resolveWebhookTenant(
  delivery: IngressCapability<'paddle-delivery'>,
  data: unknown,
  subscription: WebhookSubscriptionResolution
): Promise<WebhookTenantResolution | null> {
  if (subscription === 'ambiguous') return null;
  const customData = getPaddleCustomData(data);

  if (subscription?.subscription.tenantId) {
    const tenantId = subscription.subscription.tenantId;
    // The subscription row was read under this authority; a row naming another tenant fails closed.
    const authorityTenantId = readTenantAuthority(subscription.authority).tenantId;
    if (authorityTenantId !== tenantId) {
      throw new Error(
        `Paddle webhook subscription tenant conflict: record=${tenantId} authority=${authorityTenantId}`
      );
    }
    return { tenantId, authority: subscription.authority };
  }

  const userId = normalizeText(customData?.userId);
  if (userId) {
    // Fallback after canonical subscription lookup: exact user id to owning tenant only.
    const owner = await resolvePaddleUserOwner(userId);
    if (owner) {
      return { tenantId: owner.tenantId, authority: authorizePaddleTenant(delivery, owner) };
    }
  }

  return null;
}
