import type {
  AcceptedRecoveryPrerequisitesSnapshot,
  ClaimEscalationAgreementSnapshot,
  ClaimStatus,
  RecoveryDecisionSnapshot,
  SuccessFeeCollectionSnapshot,
} from '@/actions/staff-claims.core';

import type { AssignmentOption } from './assignment-helpers';

export interface ClaimActionPanelProps {
  readonly acceptedRecoveryPrerequisites: AcceptedRecoveryPrerequisitesSnapshot;
  readonly claimId: string;
  readonly recoveryDecision: RecoveryDecisionSnapshot;
  readonly commercialAgreement: ClaimEscalationAgreementSnapshot | null;
  readonly successFeeCollection: SuccessFeeCollectionSnapshot | null;
  readonly currentStatus: string;
  readonly staffId: string;
  readonly assigneeId: string | null;
  readonly assignmentOptions: ReadonlyArray<AssignmentOption>;
  readonly currentAssigneeLabel?: string | null;
}

export type ClaimStatusOption = {
  value: ClaimStatus;
  label: string;
};
