import type {
  ClaimCaseLifecycleState,
  ClaimRecoveryLifecycleState,
  ClaimStatus,
} from '@interdomestik/database/constants';

export type ClaimLifecycleStates = {
  caseLifecycleState: ClaimCaseLifecycleState;
  recoveryLifecycleState: ClaimRecoveryLifecycleState;
};

export const CLAIM_STATUS_LIFECYCLE_STATE_MAP = {
  draft: { caseLifecycleState: 'draft', recoveryLifecycleState: 'not_started' },
  submitted: { caseLifecycleState: 'submitted', recoveryLifecycleState: 'not_started' },
  verification: { caseLifecycleState: 'verification', recoveryLifecycleState: 'not_started' },
  evaluation: { caseLifecycleState: 'evaluation', recoveryLifecycleState: 'not_started' },
  negotiation: { caseLifecycleState: 'recovery', recoveryLifecycleState: 'negotiation' },
  court: { caseLifecycleState: 'recovery', recoveryLifecycleState: 'court' },
  resolved: { caseLifecycleState: 'resolved', recoveryLifecycleState: 'resolved' },
  rejected: { caseLifecycleState: 'rejected', recoveryLifecycleState: 'closed' },
} as const satisfies Record<ClaimStatus, ClaimLifecycleStates>;

export function mapClaimStatusToLifecycleStates(status: ClaimStatus): ClaimLifecycleStates {
  return CLAIM_STATUS_LIFECYCLE_STATE_MAP[status];
}
