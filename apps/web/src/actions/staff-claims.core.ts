'use server';

import { assignClaimCore } from './staff-claims/assign';
import { getActionContext } from './staff-claims/context';
import { saveClaimEscalationAgreementCore } from './staff-claims/save-escalation-agreement.core';
import { saveRecoveryDecisionCore } from './staff-claims/save-recovery-decision.core';
import { saveSuccessFeeCollectionCore } from './staff-claims/save-success-fee-collection.core';
import type {
  ActionResult,
  ClaimEscalationAgreementSnapshot,
  ClaimStatus,
  RecoveryDecisionSnapshot,
  RecoveryDeclineReasonCode,
  SaveClaimEscalationAgreementInput,
  SaveRecoveryDecisionInput,
  SaveSuccessFeeCollectionInput,
  SuccessFeeCollectionSnapshot,
} from './staff-claims/types';
import { updateClaimStatusCore } from './staff-claims/update-status';

export type {
  ActionResult,
  ClaimEscalationAgreementSnapshot,
  ClaimStatus,
  EscalationDecisionNextStatus,
  RecoveryDecisionSnapshot,
  RecoveryDeclineReasonCode,
  PaymentAuthorizationState,
  SaveClaimEscalationAgreementInput,
  SaveRecoveryDecisionInput,
  SaveSuccessFeeCollectionInput,
  SuccessFeeCollectionSnapshot,
} from './staff-claims/types';

/**
 * Assign a claim to a staff member on the staff surface.
 */
export async function assignClaim(claimId: string, staffId?: string | null): Promise<ActionResult> {
  const { session, requestHeaders } = await getActionContext();
  return assignClaimCore({ claimId, session, requestHeaders, staffId });
}

/**
 * Update claim status and optionally add a history note
 */
export async function updateClaimStatus(
  claimId: string,
  newStatus: ClaimStatus,
  note?: string,
  isPublicChange: boolean = true,
  allowanceOverrideReason?: string,
  declineReasonCode?: RecoveryDeclineReasonCode,
  decisionExplanation?: string
): Promise<ActionResult> {
  const { session, requestHeaders } = await getActionContext();
  return updateClaimStatusCore({
    allowanceOverrideReason,
    claimId,
    declineReasonCode,
    decisionExplanation,
    newStatus,
    note,
    isPublicChange,
    session,
    requestHeaders,
  });
}

export async function saveRecoveryDecision(
  input: SaveRecoveryDecisionInput & { idempotencyKey?: string }
): Promise<ActionResult<RecoveryDecisionSnapshot>> {
  const { session, requestHeaders } = await getActionContext();
  return saveRecoveryDecisionCore({
    ...input,
    requestHeaders,
    session,
  });
}

export async function saveClaimEscalationAgreement(
  input: SaveClaimEscalationAgreementInput & { idempotencyKey?: string }
): Promise<ActionResult<ClaimEscalationAgreementSnapshot>> {
  const { session, requestHeaders } = await getActionContext();
  return saveClaimEscalationAgreementCore({
    ...input,
    requestHeaders,
    session,
  });
}

export async function saveSuccessFeeCollection(
  input: SaveSuccessFeeCollectionInput
): Promise<ActionResult<SuccessFeeCollectionSnapshot>> {
  const { session, requestHeaders } = await getActionContext();
  return saveSuccessFeeCollectionCore({
    ...input,
    requestHeaders,
    session,
  });
}
