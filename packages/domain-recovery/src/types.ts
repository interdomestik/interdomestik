import type { ClaimRecoveryLifecycleState, ClaimStatus } from '@interdomestik/database/constants';

export const DOMAIN_RECOVERY_BOUNDARY = 'domain-recovery' as const;
export const RECOVERY_LIFECYCLE_FIELD = 'claims.recovery_lifecycle_state' as const;

export type RecoveryLifecycleState = ClaimRecoveryLifecycleState;

export type RecoveryLifecycleSnapshot = {
  claimId: string;
  status: ClaimStatus;
  recoveryLifecycleState: RecoveryLifecycleState;
};
