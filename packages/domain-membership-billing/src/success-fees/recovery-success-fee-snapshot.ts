import {
  and,
  claimEscalationAgreements,
  eq,
  subscriptions,
  type DomainEventRelayEvent,
  type DomainEventTx,
} from '@interdomestik/database';

import { resolveProviderSubscriptionHandle } from '../subscription';
import type { RecoverySuccessFeeBillingSnapshot } from './paddle-success-fee-charge';

type SuccessFeePayload = {
  collectionMethod: RecoverySuccessFeeBillingSnapshot['collectionMethod'];
  currencyCode: string;
  deductionAllowed: boolean;
  hasInvoiceDueDate: boolean;
  hasStoredPaymentMethod: boolean;
  paymentAuthorizationState: RecoverySuccessFeeBillingSnapshot['paymentAuthorizationState'];
};

function assertBooleanPayloadField(
  payload: Partial<SuccessFeePayload>,
  field: 'deductionAllowed' | 'hasInvoiceDueDate' | 'hasStoredPaymentMethod'
) {
  if (typeof payload[field] !== 'boolean') {
    throw new TypeError('success-fee billing event is missing required payload fields');
  }
}

export function requireSuccessFeePayload(event: DomainEventRelayEvent): SuccessFeePayload {
  if (
    event.eventName !== 'recovery.success_fee_collected' ||
    event.eventVersion !== 1 ||
    event.entityType !== 'claim'
  ) {
    throw new Error('success-fee billing only consumes recovery.success_fee_collected@1');
  }
  const payload = event.payload as Partial<SuccessFeePayload>;
  if (!payload.collectionMethod || !payload.currencyCode || !payload.paymentAuthorizationState) {
    throw new Error('success-fee billing event is missing required payload fields');
  }
  assertBooleanPayloadField(payload, 'deductionAllowed');
  assertBooleanPayloadField(payload, 'hasInvoiceDueDate');
  assertBooleanPayloadField(payload, 'hasStoredPaymentMethod');
  return payload as SuccessFeePayload;
}

export function assertPayloadMatchesSnapshot(
  payload: SuccessFeePayload,
  snapshot: RecoverySuccessFeeBillingSnapshot
) {
  const invoiceDueAtMatches = Boolean(snapshot.invoiceDueAt) === payload.hasInvoiceDueDate;
  if (
    payload.collectionMethod !== snapshot.collectionMethod ||
    payload.currencyCode !== snapshot.currencyCode ||
    payload.paymentAuthorizationState !== snapshot.paymentAuthorizationState ||
    Boolean(snapshot.providerCustomerId) !== payload.hasStoredPaymentMethod ||
    !invoiceDueAtMatches
  ) {
    throw new Error('success-fee billing snapshot does not match the collected event payload');
  }
}

export async function resolveSuccessFeeBillingSnapshot(
  tx: DomainEventTx,
  event: DomainEventRelayEvent
): Promise<RecoverySuccessFeeBillingSnapshot> {
  const [row] = await tx
    .select({
      collectionMethod: claimEscalationAgreements.successFeeCollectionMethod,
      currencyCode: claimEscalationAgreements.successFeeCurrencyCode,
      feeAmount: claimEscalationAgreements.successFeeAmount,
      invoiceDueAt: claimEscalationAgreements.successFeeInvoiceDueAt,
      paymentAuthorizationState: claimEscalationAgreements.paymentAuthorizationState,
      providerCustomerId: subscriptions.providerCustomerId,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      subscriptionId: subscriptions.id,
    })
    .from(claimEscalationAgreements)
    .leftJoin(
      subscriptions,
      and(
        eq(claimEscalationAgreements.successFeeSubscriptionId, subscriptions.id),
        eq(subscriptions.tenantId, event.tenantId)
      )
    )
    .where(
      and(
        eq(claimEscalationAgreements.tenantId, event.tenantId),
        eq(claimEscalationAgreements.claimId, event.entityId)
      )
    )
    .limit(1);

  if (!row?.collectionMethod || !row.currencyCode || !row.feeAmount) {
    throw new Error('success-fee billing snapshot is unavailable for collected event');
  }

  return {
    claimId: event.entityId,
    collectionMethod: row.collectionMethod,
    currencyCode: row.currencyCode,
    feeAmount: String(row.feeAmount),
    invoiceDueAt: row.invoiceDueAt,
    paymentAuthorizationState: row.paymentAuthorizationState,
    providerCustomerId: row.providerCustomerId?.trim() || null,
    providerSubscriptionId: row.subscriptionId
      ? resolveProviderSubscriptionHandle({
          id: row.subscriptionId,
          providerSubscriptionId: row.providerSubscriptionId,
        })
      : null,
    tenantId: event.tenantId,
  };
}
