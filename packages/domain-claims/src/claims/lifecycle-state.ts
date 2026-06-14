import {
  CASE_STATUS_LIFECYCLE_STATE_MAP,
  type CaseLifecycleState,
} from '@interdomestik/domain-case';
import {
  RECOVERY_STATUS_LIFECYCLE_STATE_MAP,
  type RecoveryLifecycleState,
} from '@interdomestik/domain-recovery';
import type { ClaimStatus } from '@interdomestik/database/constants';

export type ClaimLifecycleStates = {
  caseLifecycleState: CaseLifecycleState;
  recoveryLifecycleState: RecoveryLifecycleState;
};

export type { CaseLifecycleState, RecoveryLifecycleState };

export const CLAIM_STATUS_LIFECYCLE_STATE_MAP = {
  draft: {
    caseLifecycleState: CASE_STATUS_LIFECYCLE_STATE_MAP.draft,
    recoveryLifecycleState: RECOVERY_STATUS_LIFECYCLE_STATE_MAP.draft,
  },
  submitted: {
    caseLifecycleState: CASE_STATUS_LIFECYCLE_STATE_MAP.submitted,
    recoveryLifecycleState: RECOVERY_STATUS_LIFECYCLE_STATE_MAP.submitted,
  },
  verification: {
    caseLifecycleState: CASE_STATUS_LIFECYCLE_STATE_MAP.verification,
    recoveryLifecycleState: RECOVERY_STATUS_LIFECYCLE_STATE_MAP.verification,
  },
  evaluation: {
    caseLifecycleState: CASE_STATUS_LIFECYCLE_STATE_MAP.evaluation,
    recoveryLifecycleState: RECOVERY_STATUS_LIFECYCLE_STATE_MAP.evaluation,
  },
  negotiation: {
    caseLifecycleState: CASE_STATUS_LIFECYCLE_STATE_MAP.negotiation,
    recoveryLifecycleState: RECOVERY_STATUS_LIFECYCLE_STATE_MAP.negotiation,
  },
  court: {
    caseLifecycleState: CASE_STATUS_LIFECYCLE_STATE_MAP.court,
    recoveryLifecycleState: RECOVERY_STATUS_LIFECYCLE_STATE_MAP.court,
  },
  resolved: {
    caseLifecycleState: CASE_STATUS_LIFECYCLE_STATE_MAP.resolved,
    recoveryLifecycleState: RECOVERY_STATUS_LIFECYCLE_STATE_MAP.resolved,
  },
  rejected: {
    caseLifecycleState: CASE_STATUS_LIFECYCLE_STATE_MAP.rejected,
    recoveryLifecycleState: RECOVERY_STATUS_LIFECYCLE_STATE_MAP.rejected,
  },
} as const satisfies Record<ClaimStatus, ClaimLifecycleStates>;

export function mapClaimStatusToLifecycleStates(status: ClaimStatus): ClaimLifecycleStates {
  return CLAIM_STATUS_LIFECYCLE_STATE_MAP[status];
}
