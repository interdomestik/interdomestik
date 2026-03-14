import { statusEnum } from '@interdomestik/database/schema';

export type ClaimStatus = (typeof statusEnum.enumValues)[number];
export const PAYMENT_AUTHORIZATION_STATES = ['pending', 'authorized', 'revoked'] as const;
export type PaymentAuthorizationState = (typeof PAYMENT_AUTHORIZATION_STATES)[number];
export const ESCALATION_DECISION_NEXT_STATUSES = ['negotiation', 'court'] as const;
export type EscalationDecisionNextStatus = (typeof ESCALATION_DECISION_NEXT_STATUSES)[number];
export const RECOVERY_DECISION_TYPES = ['accepted', 'declined'] as const;
export type RecoveryDecisionType = (typeof RECOVERY_DECISION_TYPES)[number];
export type RecoveryDecisionStatus = RecoveryDecisionType | 'pending';
export const RECOVERY_DECLINE_REASON_CODES = [
  'guidance_only_scope',
  'insufficient_evidence',
  'no_monetary_recovery_path',
  'counterparty_unidentified',
  'time_limit_risk',
  'conflict_or_integrity_concern',
] as const;
export type RecoveryDeclineReasonCode = (typeof RECOVERY_DECLINE_REASON_CODES)[number];
export const SUCCESS_FEE_COLLECTION_METHODS = [
  'deduction',
  'payment_method_charge',
  'invoice',
] as const;
export type SuccessFeeCollectionMethod = (typeof SUCCESS_FEE_COLLECTION_METHODS)[number];

export type RecoveryDecisionSnapshot = {
  status: RecoveryDecisionStatus;
  decidedAt: string | null;
  explanation: string | null;
  declineReasonCode: RecoveryDeclineReasonCode | null;
  staffLabel: string;
  memberLabel: string | null;
  memberDescription: string | null;
};

export type MemberSafeRecoveryDecisionSnapshot = {
  status: RecoveryDecisionType;
  title: string;
  description: string | null;
};

export type ClaimEscalationAgreementSnapshot = {
  claimId: string;
  decisionNextStatus: EscalationDecisionNextStatus | null;
  decisionReason: string | null;
  feePercentage: number;
  minimumFee: string;
  legalActionCapPercentage: number;
  paymentAuthorizationState: PaymentAuthorizationState;
  termsVersion: string;
  signedAt: string | null;
  acceptedAt: string | null;
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

export type AcceptedRecoveryPrerequisitesSnapshot = {
  agreementReady: boolean;
  canMoveForward: boolean;
  collectionPathReady: boolean;
  isAcceptedRecoveryDecision: boolean;
};

export type SaveClaimEscalationAgreementInput = {
  claimId: string;
  decisionNextStatus: EscalationDecisionNextStatus;
  decisionReason: string;
  feePercentage: number;
  minimumFee: number | string;
  legalActionCapPercentage: number;
  paymentAuthorizationState: PaymentAuthorizationState;
  termsVersion: string;
};

export type SaveRecoveryDecisionInput =
  | {
      claimId: string;
      decisionType: 'accepted';
      explanation?: string;
    }
  | {
      claimId: string;
      decisionType: 'declined';
      declineReasonCode: RecoveryDeclineReasonCode;
      explanation?: string;
    };

export type SaveSuccessFeeCollectionInput = {
  claimId: string;
  recoveredAmount: number | string;
  deductionAllowed: boolean;
};

export type ActionResult<T = void> = {
  success: boolean;
  error?: string;
  data?: T;
};
