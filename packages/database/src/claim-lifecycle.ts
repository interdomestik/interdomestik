import type {
  ClaimCaseLifecycleState,
  ClaimRecoveryLifecycleState,
  ClaimStatus,
} from './constants';

export type ClaimLifecycleFields = {
  caseLifecycleState: ClaimCaseLifecycleState;
  recoveryLifecycleState: ClaimRecoveryLifecycleState;
};

export const CLAIM_STATUS_LIFECYCLE_FIELDS = {
  draft: { caseLifecycleState: 'draft', recoveryLifecycleState: 'not_started' },
  submitted: { caseLifecycleState: 'submitted', recoveryLifecycleState: 'not_started' },
  verification: { caseLifecycleState: 'verification', recoveryLifecycleState: 'not_started' },
  evaluation: { caseLifecycleState: 'evaluation', recoveryLifecycleState: 'not_started' },
  negotiation: { caseLifecycleState: 'recovery', recoveryLifecycleState: 'negotiation' },
  court: { caseLifecycleState: 'recovery', recoveryLifecycleState: 'court' },
  resolved: { caseLifecycleState: 'resolved', recoveryLifecycleState: 'resolved' },
  rejected: { caseLifecycleState: 'rejected', recoveryLifecycleState: 'closed' },
} as const satisfies Record<ClaimStatus, ClaimLifecycleFields>;

export function claimLifecycleFieldsForStatus(status: ClaimStatus): ClaimLifecycleFields {
  return CLAIM_STATUS_LIFECYCLE_FIELDS[status];
}
