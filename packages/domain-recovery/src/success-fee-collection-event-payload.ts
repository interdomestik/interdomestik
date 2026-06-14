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
