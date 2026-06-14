import { buildInvoiceBillingDetails } from './invoice-payment-terms';
import type { RecoverySuccessFeeBillingSnapshot } from './paddle-success-fee-charge';
import { RECOVERY_SUCCESS_FEE_BILLING_CONSUMER } from './success-fee-consumer';
import { toMinorUnitAmount } from './success-fee-amount';

export function buildSuccessFeeCustomData(
  snapshot: RecoverySuccessFeeBillingSnapshot,
  idempotencyKey: string
) {
  return {
    claimId: snapshot.claimId,
    billingEntity: snapshot.billingEntity,
    domainEventConsumer: RECOVERY_SUCCESS_FEE_BILLING_CONSUMER,
    idempotencyKey,
    originSubscriptionId: snapshot.providerSubscriptionId,
    recoveryLegalTenantId: snapshot.recoveryLegalTenantId,
    tenantId: snapshot.tenantId,
  };
}

function buildSuccessFeeLineItem(
  snapshot: RecoverySuccessFeeBillingSnapshot,
  idempotencyKey: string
) {
  return {
    price: {
      customData: buildSuccessFeeCustomData(snapshot, idempotencyKey),
      description: `Recovery success fee for claim ${snapshot.claimId}`,
      name: 'Recovery success fee',
      product: { name: 'Interdomestik recovery services' },
      unitPrice: {
        amount: toMinorUnitAmount(snapshot.feeAmount, snapshot.currencyCode),
        currencyCode: snapshot.currencyCode,
      },
    },
    quantity: 1,
  };
}

export function buildPaddleInvoiceTransactionRequest(
  snapshot: RecoverySuccessFeeBillingSnapshot,
  idempotencyKey: string,
  now: Date
) {
  return {
    billingDetails: buildInvoiceBillingDetails(snapshot.invoiceDueAt ?? now, now),
    collectionMode: 'manual',
    currencyCode: snapshot.currencyCode,
    customData: buildSuccessFeeCustomData(snapshot, idempotencyKey),
    items: [buildSuccessFeeLineItem(snapshot, idempotencyKey)],
    status: 'billed',
  };
}

export function buildPaddleSubscriptionChargeRequest(
  snapshot: RecoverySuccessFeeBillingSnapshot,
  idempotencyKey: string
) {
  return {
    effectiveFrom: 'immediately',
    items: [buildSuccessFeeLineItem(snapshot, idempotencyKey)],
    onPaymentFailure: 'prevent_change',
  };
}
