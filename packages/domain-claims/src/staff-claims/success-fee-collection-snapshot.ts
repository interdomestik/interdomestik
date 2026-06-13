import type { PaymentAuthorizationState, SuccessFeeCollectionSnapshot } from './types';

type DateLike = Date | string | null | undefined;

function normalizeDate(value: DateLike) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : 'EUR';
}

export function buildSuccessFeeCollectionSnapshot(params: {
  claimId: string;
  collectionMethod: SuccessFeeCollectionSnapshot['collectionMethod'];
  currencyCode: string;
  deductionAllowed: boolean;
  feeAmount: string;
  hasStoredPaymentMethod: boolean;
  invoiceDueAt: DateLike;
  paymentAuthorizationState: PaymentAuthorizationState;
  recoveredAmount: string;
  resolvedAt: DateLike;
  subscriptionId: string | null;
}): SuccessFeeCollectionSnapshot {
  return {
    claimId: params.claimId,
    collectionMethod: params.collectionMethod,
    currencyCode: params.currencyCode,
    deductionAllowed: params.deductionAllowed,
    feeAmount: params.feeAmount,
    hasStoredPaymentMethod: params.hasStoredPaymentMethod,
    invoiceDueAt: normalizeDate(params.invoiceDueAt),
    paymentAuthorizationState: params.paymentAuthorizationState,
    recoveredAmount: params.recoveredAmount,
    resolvedAt: normalizeDate(params.resolvedAt),
    subscriptionId: params.subscriptionId,
  };
}
