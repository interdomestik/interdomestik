import {
  resolveBillingEntityForLegalTenantId,
  resolveBillingEntityFromPathSegment,
  type BillingEntity,
} from './paddle-server';

export type BillingScopeSnapshot = {
  billingEntity?: string | null;
  legalTenantId?: string | null;
  tenantId?: string | null;
};

export type ResolvedBillingScope = {
  billingEntity: BillingEntity;
  legalTenantId: string;
  tenantId: string;
};

export function normalizeBillingText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveBillingScopeFromSnapshot(
  snapshot: BillingScopeSnapshot,
  label = 'billing snapshot'
): ResolvedBillingScope {
  const legalTenantId =
    normalizeBillingText(snapshot.legalTenantId) ?? normalizeBillingText(snapshot.tenantId);
  if (!legalTenantId) {
    throw new Error(`${label} is missing legal tenant scope`);
  }

  const snapshotEntity = resolveBillingEntityFromPathSegment(snapshot.billingEntity);
  if (snapshot.billingEntity && !snapshotEntity) {
    throw new Error(`${label} has unsupported billing entity ${snapshot.billingEntity}`);
  }

  const legalTenantEntity = resolveBillingEntityForLegalTenantId(legalTenantId);
  if (snapshotEntity && legalTenantEntity && snapshotEntity !== legalTenantEntity) {
    throw new Error(
      `${label} billing entity ${snapshotEntity} conflicts with legal tenant ${legalTenantId}`
    );
  }

  const billingEntity = snapshotEntity ?? legalTenantEntity;
  if (!billingEntity) {
    throw new Error(`${label} cannot resolve billing entity for legal tenant ${legalTenantId}`);
  }

  return {
    billingEntity,
    legalTenantId,
    tenantId: legalTenantId,
  };
}
