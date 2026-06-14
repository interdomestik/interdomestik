import { findSubscriptionByProviderReference } from '../subscription';
import { resolveBillingEntityFromPathSegment, type BillingEntity } from '../paddle-server';
import {
  normalizeBillingText,
  resolveBillingScopeFromSnapshot,
  type ResolvedBillingScope,
} from '../billing-snapshot';
import { RECOVERY_SUCCESS_FEE_BILLING_CONSUMER } from '../success-fees/success-fee-consumer';

type ScopeCustomData = {
  billingEntity?: string;
  billing_entity?: string;
  domainEventConsumer?: string;
  entity?: string;
  legalTenantId?: string;
  legal_tenant_id?: string;
  recoveryLegalTenantId?: string;
  recovery_legal_tenant_id?: string;
  tenantId?: string;
  tenant_id?: string;
};

type ScopePayload = {
  subscriptionId?: string | null;
  subscription_id?: string | null;
  customData?: ScopeCustomData;
  custom_data?: ScopeCustomData;
};

function resolveCustomData(payload: ScopePayload): ScopeCustomData {
  return payload.customData || payload.custom_data || {};
}

function resolveCustomEntity(customData: ScopeCustomData): BillingEntity | null {
  const rawEntity = normalizeBillingText(
    customData.billingEntity || customData.billing_entity || customData.entity
  );
  if (!rawEntity) return null;
  const entity = resolveBillingEntityFromPathSegment(rawEntity);
  if (!entity) {
    throw new Error(`Unsupported webhook billing entity metadata: ${rawEntity}`);
  }
  return entity;
}

function assertRouteEntityMatches(
  scope: ResolvedBillingScope,
  routeEntity?: BillingEntity | null
): ResolvedBillingScope {
  if (routeEntity && routeEntity !== scope.billingEntity) {
    throw new Error(
      `Billing entity mismatch for legal tenant ${scope.legalTenantId}: expected ${scope.billingEntity}, received ${routeEntity}`
    );
  }
  return scope;
}

export async function resolveInvariantScope(params: {
  billingEntity?: BillingEntity | null;
  data: unknown;
  tenantId?: string | null;
}): Promise<ResolvedBillingScope> {
  const payload = (params.data ?? {}) as ScopePayload;
  const customData = resolveCustomData(payload);
  const customEntity = resolveCustomEntity(customData);
  const customTenantId = normalizeBillingText(customData.tenantId || customData.tenant_id);
  const customLegalTenantId = normalizeBillingText(
    customData.recoveryLegalTenantId ||
      customData.recovery_legal_tenant_id ||
      customData.legalTenantId ||
      customData.legal_tenant_id
  );
  if (
    customData.domainEventConsumer === RECOVERY_SUCCESS_FEE_BILLING_CONSUMER &&
    customLegalTenantId
  ) {
    return assertRouteEntityMatches(
      resolveBillingScopeFromSnapshot(
        {
          billingEntity: customEntity ?? params.billingEntity,
          legalTenantId: customLegalTenantId,
          tenantId: customTenantId,
        },
        'recovery success-fee billing snapshot'
      ),
      params.billingEntity
    );
  }

  const subscriptionId = normalizeBillingText(payload.subscriptionId || payload.subscription_id);
  if (subscriptionId) {
    const subscription = await findSubscriptionByProviderReference(subscriptionId);
    if (subscription) {
      return assertRouteEntityMatches(
        resolveBillingScopeFromSnapshot(subscription, 'subscription billing snapshot'),
        params.billingEntity
      );
    }
  }

  return assertRouteEntityMatches(
    resolveBillingScopeFromSnapshot(
      {
        billingEntity: customEntity ?? params.billingEntity,
        legalTenantId:
          customLegalTenantId ?? normalizeBillingText(params.tenantId) ?? customTenantId,
        tenantId: normalizeBillingText(params.tenantId) ?? customTenantId,
      },
      'webhook billing snapshot'
    ),
    params.billingEntity
  );
}
