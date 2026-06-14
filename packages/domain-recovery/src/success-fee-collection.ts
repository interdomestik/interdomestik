export const PAYMENT_AUTHORIZATION_STATES = ['pending', 'authorized', 'revoked'] as const;
export type PaymentAuthorizationState = (typeof PAYMENT_AUTHORIZATION_STATES)[number];

export const SUCCESS_FEE_COLLECTION_METHODS = [
  'deduction',
  'payment_method_charge',
  'invoice',
] as const;
export type SuccessFeeCollectionMethod = (typeof SUCCESS_FEE_COLLECTION_METHODS)[number];

export type SaveSuccessFeeCollectionInput = {
  claimId: string;
  recoveredAmount: number | string;
  deductionAllowed: boolean;
};

export type SuccessFeeCollectionSnapshot = {
  claimId: string;
  recoveredAmount: string;
  currencyCode: string;
  feeAmount: string;
  collectionMethod: SuccessFeeCollectionMethod;
  deductionAllowed: boolean;
  hasStoredPaymentMethod: boolean;
  invoiceDueAt: string | null;
  paymentAuthorizationState: PaymentAuthorizationState;
  resolvedAt: string | null;
  subscriptionId: string | null;
};

export type RecoveryDateInput = Date | string | null | undefined;

export function normalizeRecoveryDate(value: RecoveryDateInput) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeRecoverySuccessFeeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

export function normalizeRecoveryCurrencyCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : 'EUR';
}

export function buildRecoverySuccessFeeCollectionSnapshot(params: {
  claimId: string;
  collectionMethod: SuccessFeeCollectionMethod;
  currencyCode: string;
  deductionAllowed: boolean;
  feeAmount: string;
  hasStoredPaymentMethod: boolean;
  invoiceDueAt: RecoveryDateInput;
  paymentAuthorizationState: PaymentAuthorizationState;
  recoveredAmount: string;
  resolvedAt: RecoveryDateInput;
  subscriptionId: string | null;
}): SuccessFeeCollectionSnapshot {
  return {
    claimId: params.claimId,
    collectionMethod: params.collectionMethod,
    currencyCode: params.currencyCode,
    deductionAllowed: params.deductionAllowed,
    feeAmount: params.feeAmount,
    hasStoredPaymentMethod: params.hasStoredPaymentMethod,
    invoiceDueAt: normalizeRecoveryDate(params.invoiceDueAt),
    paymentAuthorizationState: params.paymentAuthorizationState,
    recoveredAmount: params.recoveredAmount,
    resolvedAt: normalizeRecoveryDate(params.resolvedAt),
    subscriptionId: params.subscriptionId,
  };
}
