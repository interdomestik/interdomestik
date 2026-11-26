import type { TenantTransaction } from '@interdomestik/database';

import type { ExpiryDeliveryKey, ExpiryDeliveryRecord, ExpiryDeliveryState } from './types';

// WP-14 PR 2 supplies the production gate and delivery table, and binds the WP-07 period lock.
export async function gateInTx(_tx: TenantTransaction, _tenantId: string): Promise<boolean> {
  return false;
}

export async function lockEligiblePeriodInTx(
  _tx: TenantTransaction,
  _key: ExpiryDeliveryKey
): Promise<{ memberId: string | null } | null> {
  throw new Error('Expiry period queries are unavailable');
}

export async function lockDeliveryInTx(
  _tx: TenantTransaction,
  _key: ExpiryDeliveryKey
): Promise<ExpiryDeliveryRecord | null> {
  throw new Error('Expiry delivery queries are unavailable');
}

/** Updates the locked key, comparing the prior state, lease and authorization. */
export async function saveDeliveryInTx(
  _tx: TenantTransaction,
  _locked: ExpiryDeliveryRecord,
  _next: ExpiryDeliveryState
): Promise<boolean> {
  throw new Error('Expiry delivery queries are unavailable');
}
