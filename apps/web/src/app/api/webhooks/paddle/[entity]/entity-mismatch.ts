import { db } from '@interdomestik/database';
import {
  normalizeBillingText,
  resolveBillingScopeFromSnapshot,
  type BillingScopeSnapshot,
} from '@interdomestik/domain-membership-billing/billing-snapshot';
import {
  resolveBillingEntityFromPathSegment,
  type BillingEntity,
} from '@interdomestik/domain-membership-billing/paddle-server';
import { findSubscriptionByProviderReference } from '@interdomestik/domain-membership-billing';

type PaddleWebhookCustomData = {
  billingEntity?: string;
  billing_entity?: string;
  entity?: string;
  tenantId?: string;
  tenant_id?: string;
  userId?: string;
};

type PaddleWebhookData = {
  id?: string;
  subscriptionId?: string | null;
  subscription_id?: string | null;
  customData?: PaddleWebhookCustomData;
  custom_data?: PaddleWebhookCustomData;
};

function resolveCustomData(payload: PaddleWebhookData): PaddleWebhookCustomData {
  return payload.customData || payload.custom_data || {};
}

function resolveExplicitEntity(payload: PaddleWebhookData): BillingEntity | null {
  const customData = resolveCustomData(payload);
  return resolveBillingEntityFromPathSegment(
    customData.entity || customData.billingEntity || customData.billing_entity
  );
}

function resolveEntityFromSnapshot(snapshot: BillingScopeSnapshot): BillingEntity | null {
  try {
    return resolveBillingScopeFromSnapshot(snapshot, 'webhook entity preflight snapshot')
      .billingEntity;
  } catch {
    return null;
  }
}

async function resolveSnapshotEntity(payload: PaddleWebhookData): Promise<BillingEntity | null> {
  const subscriptionId =
    normalizeBillingText(payload.subscriptionId) ||
    normalizeBillingText(payload.subscription_id) ||
    normalizeBillingText(payload.id);
  if (!subscriptionId) return null;

  const subscription = await findSubscriptionByProviderReference(subscriptionId);
  if (!subscription) return null;

  return resolveEntityFromSnapshot(subscription);
}

async function resolveFallbackEntity(payload: PaddleWebhookData): Promise<BillingEntity | null> {
  const customData = resolveCustomData(payload);
  const explicitTenantId = normalizeBillingText(customData.tenantId || customData.tenant_id);
  if (explicitTenantId) return resolveEntityFromSnapshot({ legalTenantId: explicitTenantId });

  const userId = normalizeBillingText(customData.userId);
  if (!userId) return null;

  // db-access-guard: system-exempt -- reason: Paddle userId lookup bootstraps route preflight
  const userRecord = await db.query.user.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
    columns: { tenantId: true },
  });
  return resolveEntityFromSnapshot({ legalTenantId: userRecord?.tenantId });
}

export async function isEntityMismatch(
  expectedEntity: BillingEntity,
  data: unknown
): Promise<boolean> {
  const payload = (data ?? {}) as PaddleWebhookData;
  const snapshotEntity = await resolveSnapshotEntity(payload);
  if (snapshotEntity) return snapshotEntity !== expectedEntity;

  const explicitEntity = resolveExplicitEntity(payload);
  if (explicitEntity) return explicitEntity !== expectedEntity;

  const fallbackEntity = await resolveFallbackEntity(payload);
  return Boolean(fallbackEntity && fallbackEntity !== expectedEntity);
}
