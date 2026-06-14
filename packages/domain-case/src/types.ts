import type { ClaimCaseLifecycleState, ClaimStatus } from '@interdomestik/database/constants';

export const DOMAIN_CASE_BOUNDARY = 'domain-case' as const;
export const CASE_LIFECYCLE_FIELD = 'claims.case_lifecycle_state' as const;

export type CaseLifecycleState = ClaimCaseLifecycleState;

export const CASE_STATUS_LIFECYCLE_STATE_MAP = {
  draft: 'draft',
  submitted: 'submitted',
  verification: 'verification',
  evaluation: 'evaluation',
  negotiation: 'recovery',
  court: 'recovery',
  resolved: 'resolved',
  rejected: 'rejected',
} as const satisfies Record<ClaimStatus, CaseLifecycleState>;

export type CaseLifecycleSnapshot = {
  claimId: string;
  status: ClaimStatus;
  caseLifecycleState: CaseLifecycleState;
};

export function mapCaseStatusToLifecycleState(status: ClaimStatus): CaseLifecycleState {
  return CASE_STATUS_LIFECYCLE_STATE_MAP[status];
}
