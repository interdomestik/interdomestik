import type { ClaimRecoveryLifecycleState, ClaimStatus } from '@interdomestik/database/constants';

export const DOMAIN_RECOVERY_BOUNDARY = 'domain-recovery' as const;
export const RECOVERY_LIFECYCLE_FIELD = 'claims.recovery_lifecycle_state' as const;

export type RecoveryLifecycleState = ClaimRecoveryLifecycleState;

export const RECOVERY_STATUS_LIFECYCLE_STATE_MAP = {
  draft: 'not_started',
  submitted: 'not_started',
  submitted_to_airline: 'submitted_to_airline',
  verification: 'not_started',
  evaluation: 'not_started',
  negotiation: 'negotiation',
  court: 'court',
  resolved: 'resolved',
  rejected: 'closed',
} as const satisfies Record<ClaimStatus, RecoveryLifecycleState>;

export type RecoveryLifecycleSnapshot = {
  claimId: string;
  status: ClaimStatus;
  recoveryLifecycleState: RecoveryLifecycleState;
  recoveryLaw: string | null;
  recoveryLegalTenantId: string | null;
};

export function mapRecoveryStatusToLifecycleState(status: ClaimStatus): RecoveryLifecycleState {
  return RECOVERY_STATUS_LIFECYCLE_STATE_MAP[status];
}
