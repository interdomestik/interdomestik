import type { ClaimCaseLifecycleState, ClaimStatus } from '@interdomestik/database/constants';

export const DOMAIN_CASE_BOUNDARY = 'domain-case' as const;
export const CASE_LIFECYCLE_FIELD = 'claims.case_lifecycle_state' as const;

export type CaseLifecycleState = ClaimCaseLifecycleState;

export type CaseLifecycleSnapshot = {
  claimId: string;
  status: ClaimStatus;
  caseLifecycleState: CaseLifecycleState;
};
