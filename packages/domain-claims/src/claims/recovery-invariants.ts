import type { ClaimStatus } from '@interdomestik/database/constants';
import { resolveRecoverySuccessFeeCollectionSnapshot } from '@interdomestik/domain-recovery';
import type { PaymentAuthorizationState } from '../staff-claims/types';

export type RecoveryInvariantRejectionReason =
  | 'signed_agreement_authorization_required'
  | 'legal_action_cap_required'
  | 'success_fee_or_no_fee_required';

export type RecoveryInvariantEvidence = {
  acceptedAt?: Date | null;
  claimId: string;
  legalActionCapPercentage?: number | null;
  noFeeDocumentedAt?: Date | null;
  noFeeDocumentedById?: string | null;
  noFeeReasonCode?: string | null;
  paymentAuthorizationState?: PaymentAuthorizationState | null;
  signedAt?: Date | null;
  successFeeAmount?: string | null;
  successFeeCollectionMethod?: 'deduction' | 'payment_method_charge' | 'invoice' | null;
  successFeeCurrencyCode?: string | null;
  successFeeDeductionAllowed?: boolean | null;
  successFeeHasStoredPaymentMethod?: boolean | null;
  successFeeInvoiceDueAt?: Date | null;
  successFeeRecoveredAmount?: string | null;
  successFeeResolvedAt?: Date | null;
  successFeeSubscriptionId?: string | null;
};

const SIGNED_AUTHORIZATION_STATUSES = new Set<ClaimStatus>(['negotiation', 'court']);

export function needsRecoveryInvariantEvidence(toStatus: ClaimStatus): boolean {
  return (
    SIGNED_AUTHORIZATION_STATUSES.has(toStatus) ||
    toStatus === 'resolved' ||
    toStatus === 'submitted_to_airline'
  );
}

function hasSignedPaymentAuthorization(evidence: RecoveryInvariantEvidence | null): boolean {
  return Boolean(evidence?.signedAt && evidence.paymentAuthorizationState === 'authorized');
}

function hasLegalActionCap(evidence: RecoveryInvariantEvidence | null): boolean {
  return typeof evidence?.legalActionCapPercentage === 'number';
}

function hasDocumentedNoFeeEvidence(evidence: RecoveryInvariantEvidence | null): boolean {
  return Boolean(
    evidence?.noFeeReasonCode && evidence.noFeeDocumentedAt && evidence.noFeeDocumentedById
  );
}

function hasSuccessFeeEvidence(evidence: RecoveryInvariantEvidence | null): boolean {
  if (!evidence) return false;

  return Boolean(
    resolveRecoverySuccessFeeCollectionSnapshot({
      claimId: evidence.claimId,
      collectionMethod: evidence.successFeeCollectionMethod,
      currencyCode: evidence.successFeeCurrencyCode,
      deductionAllowed: evidence.successFeeDeductionAllowed,
      feeAmount: evidence.successFeeAmount,
      hasStoredPaymentMethod: evidence.successFeeHasStoredPaymentMethod,
      invoiceDueAt: evidence.successFeeInvoiceDueAt,
      paymentAuthorizationState: evidence.paymentAuthorizationState,
      recoveredAmount: evidence.successFeeRecoveredAmount,
      resolvedAt: evidence.successFeeResolvedAt,
      subscriptionId: evidence.successFeeSubscriptionId,
    })
  );
}

export function evaluateRecoveryInvariants(params: {
  evidence: RecoveryInvariantEvidence | null;
  toStatus: ClaimStatus;
}): RecoveryInvariantRejectionReason | null {
  const { evidence, toStatus } = params;

  if (SIGNED_AUTHORIZATION_STATUSES.has(toStatus) && !hasSignedPaymentAuthorization(evidence)) {
    return 'signed_agreement_authorization_required';
  }

  if (toStatus === 'court' && !hasLegalActionCap(evidence)) {
    return 'legal_action_cap_required';
  }

  if (
    toStatus === 'resolved' &&
    !hasSuccessFeeEvidence(evidence) &&
    !hasDocumentedNoFeeEvidence(evidence)
  ) {
    return 'success_fee_or_no_fee_required';
  }

  return null;
}
