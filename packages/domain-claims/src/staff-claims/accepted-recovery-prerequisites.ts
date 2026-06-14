import {
  resolveRecoverySuccessFeeCollectionSnapshot,
  type RecoverySuccessFeeCollectionSnapshotSource,
} from '@interdomestik/domain-recovery';

import type {
  AcceptedRecoveryPrerequisitesSnapshot,
  ClaimEscalationAgreementSnapshot,
  CommercialHandlingScopeSnapshot,
  PaymentAuthorizationState,
  RecoveryDecisionStatus,
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

export function buildSuccessFeeCollectionSnapshot(
  source: RecoverySuccessFeeCollectionSnapshotSource | null | undefined
): SuccessFeeCollectionSnapshot | null {
  return resolveRecoverySuccessFeeCollectionSnapshot(source);
}

export function buildAcceptedRecoveryPrerequisitesSnapshot(params: {
  commercialAgreement: ClaimEscalationAgreementSnapshot | null;
  commercialScope: CommercialHandlingScopeSnapshot;
  recoveryDecisionStatus: RecoveryDecisionStatus;
  successFeeCollection: SuccessFeeCollectionSnapshot | null;
}): AcceptedRecoveryPrerequisitesSnapshot {
  const isAcceptedRecoveryDecision = params.recoveryDecisionStatus === 'accepted';
  const agreementReady = params.commercialAgreement !== null;
  const collectionPathReady = params.successFeeCollection !== null;

  return {
    agreementReady,
    canMoveForward:
      params.commercialScope.isEligible &&
      isAcceptedRecoveryDecision &&
      agreementReady &&
      collectionPathReady,
    collectionPathReady,
    commercialScope: params.commercialScope,
    isAcceptedRecoveryDecision,
  };
}
