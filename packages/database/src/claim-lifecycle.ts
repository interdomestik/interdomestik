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
  submitted_to_airline: {
    caseLifecycleState: 'recovery',
    recoveryLifecycleState: 'submitted_to_airline',
  },
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

export function claimStatusFromLifecycleFields(input: {
  caseLifecycleState: ClaimCaseLifecycleState | string | null | undefined;
  recoveryLifecycleState: ClaimRecoveryLifecycleState | string | null | undefined;
}): ClaimStatus {
  const pair = `${input.caseLifecycleState ?? ''}:${input.recoveryLifecycleState ?? ''}`;
  switch (pair) {
    case 'draft:not_started':
      return 'draft';
    case 'submitted:not_started':
      return 'submitted';
    case 'recovery:submitted_to_airline':
      return 'submitted_to_airline';
    case 'verification:not_started':
      return 'verification';
    case 'evaluation:not_started':
      return 'evaluation';
    case 'recovery:negotiation':
      return 'negotiation';
    case 'recovery:court':
      return 'court';
    case 'resolved:resolved':
      return 'resolved';
    case 'rejected:closed':
      return 'rejected';
    default:
      throw new Error(`Invalid claim lifecycle state pair: ${pair}`);
  }
}
