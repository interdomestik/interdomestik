import {
  CLAIM_CASE_LIFECYCLE_STATES,
  CLAIM_RECOVERY_LIFECYCLE_STATES,
  type ClaimStatus,
} from '@interdomestik/database/constants';

import {
  CLAIM_STATUS_LIFECYCLE_STATE_MAP,
  mapClaimStatusToLifecycleStates,
  type CaseLifecycleState,
  type RecoveryLifecycleState,
} from './lifecycle-state';
import { isClaimStatus } from './transition-guard';

type LifecycleAuthority = 'lifecycle' | 'status_fallback';
type LifecycleConsistency = 'consistent' | 'status_mismatch' | 'invalid_lifecycle_pair';

export type ClaimLifecycleReadInput = {
  status?: string | null | undefined;
  caseLifecycleState: string | null | undefined;
  recoveryLifecycleState: string | null | undefined;
};

export type ClaimLifecycleReadProjection = {
  authority: LifecycleAuthority;
  caseLifecycleState: CaseLifecycleState;
  recoveryLifecycleState: RecoveryLifecycleState;
  status: ClaimStatus;
  consistency: LifecycleConsistency;
};

export type ClaimLifecycleCommandProjection =
  | {
      authority: LifecycleAuthority;
      success: true;
      caseLifecycleState: CaseLifecycleState;
      recoveryLifecycleState: RecoveryLifecycleState;
      status: ClaimStatus;
    }
  | { success: false; error: 'invalid_lifecycle_state' | 'invalid_lifecycle_pair' };

const CASE_STATE_SET = new Set<string>(CLAIM_CASE_LIFECYCLE_STATES);
const RECOVERY_STATE_SET = new Set<string>(CLAIM_RECOVERY_LIFECYCLE_STATES);

const STATUS_BY_LIFECYCLE_PAIR = Object.fromEntries(
  Object.entries(CLAIM_STATUS_LIFECYCLE_STATE_MAP).map(([status, states]) => [
    lifecyclePairKey(states.caseLifecycleState, states.recoveryLifecycleState),
    status,
  ])
) as Record<string, ClaimStatus | undefined>;

function lifecyclePairKey(
  caseLifecycleState: CaseLifecycleState,
  recoveryLifecycleState: RecoveryLifecycleState
): string {
  return `${caseLifecycleState}:${recoveryLifecycleState}`;
}

function isCaseLifecycleState(value: string | null | undefined): value is CaseLifecycleState {
  return typeof value === 'string' && CASE_STATE_SET.has(value);
}

function isRecoveryLifecycleState(
  value: string | null | undefined
): value is RecoveryLifecycleState {
  return typeof value === 'string' && RECOVERY_STATE_SET.has(value);
}

function fallbackStatus(value: string | null | undefined): ClaimStatus {
  return isClaimStatus(value) ? value : 'draft';
}

export function resolveClaimLifecycleReadProjection(
  input: ClaimLifecycleReadInput
): ClaimLifecycleReadProjection {
  const compatStatus = fallbackStatus(input.status);
  const fallbackStates = mapClaimStatusToLifecycleStates(compatStatus);
  const inputCaseState = input.caseLifecycleState;
  const inputRecoveryState = input.recoveryLifecycleState;
  const hasCaseState = isCaseLifecycleState(inputCaseState);
  const hasRecoveryState = isRecoveryLifecycleState(inputRecoveryState);
  const caseLifecycleState = hasCaseState ? inputCaseState : fallbackStates.caseLifecycleState;
  const recoveryLifecycleState = hasRecoveryState
    ? inputRecoveryState
    : fallbackStates.recoveryLifecycleState;
  const lifecycleStatus =
    hasCaseState && hasRecoveryState
      ? STATUS_BY_LIFECYCLE_PAIR[lifecyclePairKey(caseLifecycleState, recoveryLifecycleState)]
      : undefined;
  const status = lifecycleStatus ?? compatStatus;
  let consistency: ClaimLifecycleReadProjection['consistency'] = 'consistent';

  if (lifecycleStatus === undefined && hasCaseState && hasRecoveryState) {
    consistency = 'invalid_lifecycle_pair';
  } else if (lifecycleStatus !== undefined && lifecycleStatus !== compatStatus) {
    consistency = 'status_mismatch';
  }

  return {
    authority: hasCaseState && hasRecoveryState ? 'lifecycle' : 'status_fallback',
    caseLifecycleState,
    recoveryLifecycleState,
    status,
    consistency,
  };
}

export function resolveClaimLifecycleCommandProjection(
  input: ClaimLifecycleReadInput
): ClaimLifecycleCommandProjection {
  const inputCaseState = input.caseLifecycleState;
  const inputRecoveryState = input.recoveryLifecycleState;

  if (isCaseLifecycleState(inputCaseState) && isRecoveryLifecycleState(inputRecoveryState)) {
    const status = STATUS_BY_LIFECYCLE_PAIR[lifecyclePairKey(inputCaseState, inputRecoveryState)];
    if (!status) {
      return { success: false, error: 'invalid_lifecycle_pair' };
    }

    return {
      authority: 'lifecycle',
      success: true,
      caseLifecycleState: inputCaseState,
      recoveryLifecycleState: inputRecoveryState,
      status,
    };
  }

  if (inputCaseState == null && inputRecoveryState == null && isClaimStatus(input.status)) {
    return {
      authority: 'status_fallback',
      success: true,
      ...mapClaimStatusToLifecycleStates(input.status),
      status: input.status,
    };
  }

  return { success: false, error: 'invalid_lifecycle_state' };
}
