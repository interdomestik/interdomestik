import {
  buildRecoverySuccessFeeCollectionSnapshot,
  normalizeRecoveryDate,
  normalizeRecoverySuccessFeeString,
  type PaymentAuthorizationState,
  type SuccessFeeCollectionMethod,
  type SuccessFeeCollectionSnapshot,
} from './success-fee-collection';

export type RecoverySuccessFeeCollectionSnapshotSource = {
  claimId: string;
  collectionMethod?: SuccessFeeCollectionMethod | null;
  currencyCode?: string | null;
  deductionAllowed?: boolean | null;
  feeAmount?: string | null;
  hasStoredPaymentMethod?: boolean | null;
  invoiceDueAt?: Date | string | null;
  paymentAuthorizationState?: PaymentAuthorizationState | null;
  recoveredAmount?: string | null;
  resolvedAt?: Date | string | null;
  subscriptionId?: string | null;
};

function hasRequiredCollectionFields(
  source: RecoverySuccessFeeCollectionSnapshotSource | null | undefined
): source is RecoverySuccessFeeCollectionSnapshotSource & {
  collectionMethod: SuccessFeeCollectionMethod;
  currencyCode: string;
  deductionAllowed: boolean;
  feeAmount: string;
  hasStoredPaymentMethod: boolean;
  paymentAuthorizationState: PaymentAuthorizationState;
  recoveredAmount: string;
  resolvedAt: Date | string;
} {
  return Boolean(
    source?.collectionMethod &&
    source.currencyCode != null &&
    source.deductionAllowed != null &&
    source.feeAmount != null &&
    source.hasStoredPaymentMethod != null &&
    source.paymentAuthorizationState != null &&
    source.recoveredAmount != null &&
    source.resolvedAt
  );
}

function hasUsableCollectionPath(
  source: RecoverySuccessFeeCollectionSnapshotSource & {
    collectionMethod: SuccessFeeCollectionMethod;
    deductionAllowed: boolean;
    hasStoredPaymentMethod: boolean;
    paymentAuthorizationState: PaymentAuthorizationState;
  }
): boolean {
  switch (source.collectionMethod) {
    case 'deduction':
      return source.deductionAllowed;
    case 'payment_method_charge':
      return (
        source.hasStoredPaymentMethod &&
        source.paymentAuthorizationState === 'authorized' &&
        Boolean(normalizeRecoverySuccessFeeString(source.subscriptionId))
      );
    case 'invoice':
      return normalizeRecoveryDate(source.invoiceDueAt) !== null;
    default:
      return false;
  }
}

export function resolveRecoverySuccessFeeCollectionSnapshot(
  source: RecoverySuccessFeeCollectionSnapshotSource | null | undefined
): SuccessFeeCollectionSnapshot | null {
  if (!hasRequiredCollectionFields(source)) return null;

  const snapshot = buildRecoverySuccessFeeCollectionSnapshot({
    claimId: source.claimId,
    collectionMethod: source.collectionMethod,
    currencyCode: normalizeRecoverySuccessFeeString(source.currencyCode) ?? '',
    deductionAllowed: source.deductionAllowed,
    feeAmount: normalizeRecoverySuccessFeeString(source.feeAmount) ?? '',
    hasStoredPaymentMethod: source.hasStoredPaymentMethod,
    invoiceDueAt: source.invoiceDueAt,
    paymentAuthorizationState: source.paymentAuthorizationState,
    recoveredAmount: normalizeRecoverySuccessFeeString(source.recoveredAmount) ?? '',
    resolvedAt: source.resolvedAt,
    subscriptionId: normalizeRecoverySuccessFeeString(source.subscriptionId),
  });

  if (
    !snapshot.resolvedAt ||
    !snapshot.recoveredAmount ||
    !snapshot.currencyCode ||
    !snapshot.feeAmount
  ) {
    return null;
  }

  return hasUsableCollectionPath({ ...source, subscriptionId: snapshot.subscriptionId })
    ? snapshot
    : null;
}
