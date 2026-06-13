import { appendEvent, type DomainEventTx } from '@interdomestik/database';

import type { ClaimsSession } from '../claims/types';
import type {
  PaymentAuthorizationState,
  SuccessFeeCollectionMethod,
  SuccessFeeCollectionSnapshot,
} from './types';

function buildSuccessFeeCollectionPayload(params: {
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

export async function recordSuccessFeeCollectionEvent(params: {
  claimId: string;
  collectionMethod: SuccessFeeCollectionSnapshot['collectionMethod'];
  currencyCode: string;
  deductionAllowed: boolean;
  hasStoredPaymentMethod: boolean;
  invoiceDueAt: Date | null;
  now: Date;
  paymentAuthorizationState: PaymentAuthorizationState;
  session: ClaimsSession;
  tenantId: string;
  tx: DomainEventTx;
}) {
  await appendEvent(params.tx, {
    actor: { id: params.session.user.id, role: params.session.user.role?.trim() || 'staff' },
    aggregateVersion: 0,
    correlationId: `claim:${params.claimId}:recovery-success-fee-collected:${params.collectionMethod}`,
    createdAt: params.now,
    entity: { id: params.claimId, type: 'claim' },
    eventName: 'recovery.success_fee_collected',
    eventVersion: 1,
    payload: buildSuccessFeeCollectionPayload(params),
    tenantId: params.tenantId,
  });
}
