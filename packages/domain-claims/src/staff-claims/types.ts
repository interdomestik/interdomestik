import { statusEnum } from '@interdomestik/database/schema';

export type ClaimStatus = (typeof statusEnum.enumValues)[number];
export const PAYMENT_AUTHORIZATION_STATES = ['pending', 'authorized', 'revoked'] as const;
export type PaymentAuthorizationState = (typeof PAYMENT_AUTHORIZATION_STATES)[number];

export type ClaimEscalationAgreementSnapshot = {
  claimId: string;
  feePercentage: number;
  minimumFee: string;
  legalActionCapPercentage: number;
  paymentAuthorizationState: PaymentAuthorizationState;
  termsVersion: string;
  signedAt: string | null;
  acceptedAt: string | null;
};

export type SaveClaimEscalationAgreementInput = {
  claimId: string;
  feePercentage: number;
  minimumFee: number | string;
  legalActionCapPercentage: number;
  paymentAuthorizationState: PaymentAuthorizationState;
  termsVersion: string;
};

export type ActionResult<T = void> = {
  success: boolean;
  error?: string;
  data?: T;
};
