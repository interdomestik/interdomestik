'use server';
import {
  assignClaim,
  saveClaimEscalationAgreement,
  saveSuccessFeeCollection,
  updateClaimStatus,
} from './staff-claims.core';
export type { ActionResult, ClaimStatus } from './staff-claims.core';
export type {
  ClaimEscalationAgreementSnapshot,
  PaymentAuthorizationState,
  SaveClaimEscalationAgreementInput,
  SaveSuccessFeeCollectionInput,
  SuccessFeeCollectionSnapshot,
} from './staff-claims.core';
export { assignClaim, saveClaimEscalationAgreement, saveSuccessFeeCollection, updateClaimStatus };
