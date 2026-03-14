import { statusEnum } from '@interdomestik/database/schema';

export type ClaimStatus = (typeof statusEnum.enumValues)[number];
export const PAYMENT_AUTHORIZATION_STATES = ['pending', 'authorized', 'revoked'] as const;
export type PaymentAuthorizationState = (typeof PAYMENT_AUTHORIZATION_STATES)[number];
export const ESCALATION_DECISION_NEXT_STATUSES = ['negotiation', 'court'] as const;
export type EscalationDecisionNextStatus = (typeof ESCALATION_DECISION_NEXT_STATUSES)[number];
export const SUCCESS_FEE_COLLECTION_METHODS = [
  'deduction',
  'payment_method_charge',
  'invoice',
] as const;
export type SuccessFeeCollectionMethod = (typeof SUCCESS_FEE_COLLECTION_METHODS)[number];

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
