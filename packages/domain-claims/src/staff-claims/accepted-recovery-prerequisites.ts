import type {
  AcceptedRecoveryPrerequisitesSnapshot,
  ClaimEscalationAgreementSnapshot,
  PaymentAuthorizationState,
  RecoveryDecisionStatus,
  SuccessFeeCollectionMethod,
  SuccessFeeCollectionSnapshot,
} from './types';

type DateLike = Date | string | null | undefined;

type CommercialAgreementSnapshotSource = {
  acceptedAt?: DateLike;
  claimId: string;
  decisionNextStatus?: ClaimEscalationAgreementSnapshot['decisionNextStatus'] | null;
  decisionReason?: string | null;
  feePercentage?: number | null;
  legalActionCapPercentage?: number | null;
  minimumFee?: string | null;
  paymentAuthorizationState?: PaymentAuthorizationState | null;
  signedAt?: DateLike;
  termsVersion?: string | null;
};

type SuccessFeeCollectionSnapshotSource = {
  claimId: string;
  collectionMethod?: SuccessFeeCollectionMethod | null;
  currencyCode?: string | null;
  deductionAllowed?: boolean | null;
  feeAmount?: string | null;
  hasStoredPaymentMethod?: boolean | null;
  invoiceDueAt?: DateLike;
  paymentAuthorizationState?: PaymentAuthorizationState | null;
  recoveredAmount?: string | null;
  resolvedAt?: DateLike;
  subscriptionId?: string | null;
};

function normalizeDate(value: DateLike) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeTrimmedString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function hasRequiredAgreementFields(
  source: CommercialAgreementSnapshotSource | null | undefined
): source is CommercialAgreementSnapshotSource & {
  acceptedAt: DateLike;
  decisionNextStatus: NonNullable<ClaimEscalationAgreementSnapshot['decisionNextStatus']>;
  feePercentage: number;
  legalActionCapPercentage: number;
  minimumFee: string;
  paymentAuthorizationState: PaymentAuthorizationState;
  signedAt: DateLike;
  termsVersion: string;
} {
  return Boolean(
    source?.acceptedAt &&
    source.decisionNextStatus &&
    source.feePercentage != null &&
    source.legalActionCapPercentage != null &&
    source.minimumFee != null &&
    source.paymentAuthorizationState != null &&
    source.signedAt &&
    source.termsVersion != null
  );
}

export function buildCommercialAgreementSnapshot(
  source: CommercialAgreementSnapshotSource | null | undefined
): ClaimEscalationAgreementSnapshot | null {
  if (!hasRequiredAgreementFields(source)) {
    return null;
  }

  const signedAt = normalizeDate(source.signedAt);
  const acceptedAt = normalizeDate(source.acceptedAt);
  const minimumFee = normalizeTrimmedString(source.minimumFee);
  const termsVersion = normalizeTrimmedString(source.termsVersion);

  if (!signedAt || !acceptedAt || !minimumFee || !termsVersion) {
    return null;
  }

  return {
    acceptedAt,
    claimId: source.claimId,
    decisionNextStatus: source.decisionNextStatus,
    decisionReason: normalizeTrimmedString(source.decisionReason),
    feePercentage: source.feePercentage,
    legalActionCapPercentage: source.legalActionCapPercentage,
    minimumFee,
    paymentAuthorizationState: source.paymentAuthorizationState,
    signedAt,
    termsVersion,
  };
}

function hasRequiredCollectionFields(
  source: SuccessFeeCollectionSnapshotSource | null | undefined
): source is SuccessFeeCollectionSnapshotSource & {
  collectionMethod: SuccessFeeCollectionMethod;
  currencyCode: string;
  deductionAllowed: boolean;
  feeAmount: string;
  hasStoredPaymentMethod: boolean;
  paymentAuthorizationState: PaymentAuthorizationState;
  recoveredAmount: string;
  resolvedAt: DateLike;
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
  source: SuccessFeeCollectionSnapshotSource & {
    collectionMethod: SuccessFeeCollectionMethod;
    deductionAllowed: boolean;
    hasStoredPaymentMethod: boolean;
    paymentAuthorizationState: PaymentAuthorizationState;
  }
) {
  switch (source.collectionMethod) {
    case 'deduction':
      return source.deductionAllowed;
    case 'payment_method_charge':
      return (
        source.hasStoredPaymentMethod &&
        source.paymentAuthorizationState === 'authorized' &&
        Boolean(normalizeTrimmedString(source.subscriptionId))
      );
    case 'invoice':
      return normalizeDate(source.invoiceDueAt) !== null;
    default:
      return false;
  }
}

export function buildSuccessFeeCollectionSnapshot(
  source: SuccessFeeCollectionSnapshotSource | null | undefined
): SuccessFeeCollectionSnapshot | null {
  if (!hasRequiredCollectionFields(source)) {
    return null;
  }

  const resolvedAt = normalizeDate(source.resolvedAt);
  const recoveredAmount = normalizeTrimmedString(source.recoveredAmount);
  const currencyCode = normalizeTrimmedString(source.currencyCode);
  const feeAmount = normalizeTrimmedString(source.feeAmount);
  const invoiceDueAt = normalizeDate(source.invoiceDueAt);
  const subscriptionId = normalizeTrimmedString(source.subscriptionId);

  if (!resolvedAt || !recoveredAmount || !currencyCode || !feeAmount) {
    return null;
  }

  if (
    !hasUsableCollectionPath({
      ...source,
      subscriptionId,
    })
  ) {
    return null;
  }

  return {
    claimId: source.claimId,
    collectionMethod: source.collectionMethod,
    currencyCode,
    deductionAllowed: source.deductionAllowed,
    feeAmount,
    hasStoredPaymentMethod: source.hasStoredPaymentMethod,
    invoiceDueAt,
    paymentAuthorizationState: source.paymentAuthorizationState,
    recoveredAmount,
    resolvedAt,
    subscriptionId,
  };
}

export function buildAcceptedRecoveryPrerequisitesSnapshot(params: {
  commercialAgreement: ClaimEscalationAgreementSnapshot | null;
  recoveryDecisionStatus: RecoveryDecisionStatus;
  successFeeCollection: SuccessFeeCollectionSnapshot | null;
}): AcceptedRecoveryPrerequisitesSnapshot {
  const isAcceptedRecoveryDecision = params.recoveryDecisionStatus === 'accepted';
  const agreementReady = params.commercialAgreement !== null;
  const collectionPathReady = params.successFeeCollection !== null;

  return {
    agreementReady,
    canMoveForward: isAcceptedRecoveryDecision && agreementReady && collectionPathReady,
    collectionPathReady,
    isAcceptedRecoveryDecision,
  };
}
