import type { DomainEventRelayEvent } from '@interdomestik/database';

import type { RecoverySuccessFeeBillingSnapshot } from './paddle-success-fee-charge';

export function resolveBillableSuccessFeeSnapshot(
  snapshot: RecoverySuccessFeeBillingSnapshot,
  event: DomainEventRelayEvent
): RecoverySuccessFeeBillingSnapshot {
  if (
    snapshot.collectionMethod !== 'payment_method_charge' ||
    !snapshot.subscriptionBillingEntity ||
    snapshot.subscriptionBillingEntity === snapshot.billingEntity
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    collectionMethod: 'invoice',
    invoiceDueAt: snapshot.invoiceDueAt ?? event.createdAt,
  };
}
