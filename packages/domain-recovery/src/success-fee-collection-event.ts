import { appendEvent, type DomainEventTx } from '@interdomestik/database';

import type {
  PaymentAuthorizationState,
  SuccessFeeCollectionMethod,
} from './success-fee-collection';

export function buildRecoverySuccessFeeCollectedPayload(params: {
  collectionMethod: SuccessFeeCollectionMethod;
  currencyCode: string;
  deductionAllowed: boolean;
  hasStoredPaymentMethod: boolean;
  invoiceDueAt: Date | null;
  paymentAuthorizationState: PaymentAuthorizationState;
}) {
  return {
    collectionMethod: params.collectionMethod,
    currencyCode: params.currencyCode,
    deductionAllowed: params.deductionAllowed,
    hasInvoiceDueDate: Boolean(params.invoiceDueAt),
    hasStoredPaymentMethod: params.hasStoredPaymentMethod,
    paymentAuthorizationState: params.paymentAuthorizationState,
  };
}

export async function recordRecoverySuccessFeeCollectedEvent(params: {
  actor: { id: string; role?: string | null };
  claimId: string;
  collectionMethod: SuccessFeeCollectionMethod;
  currencyCode: string;
  deductionAllowed: boolean;
  hasStoredPaymentMethod: boolean;
  invoiceDueAt: Date | null;
  now: Date;
  paymentAuthorizationState: PaymentAuthorizationState;
  tenantId: string;
  tx: DomainEventTx;
}) {
  await appendEvent(params.tx, {
    actor: { id: params.actor.id, role: params.actor.role?.trim() || 'staff' },
    aggregateVersion: 0,
    correlationId: `claim:${params.claimId}:recovery-success-fee-collected:${params.collectionMethod}`,
    createdAt: params.now,
    entity: { id: params.claimId, type: 'claim' },
    eventName: 'recovery.success_fee_collected',
    eventVersion: 1,
    payload: buildRecoverySuccessFeeCollectedPayload(params),
    tenantId: params.tenantId,
  });
}
