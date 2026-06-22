import type { ClaimStatus } from '@interdomestik/database/constants';
import { mapClaimStatusToLifecycleStates } from './lifecycle-state';

export function authorizedRecoveryReadRow(params: {
  claimId?: string;
  caseLifecycleState?: string | null;
  lifecycleVersion: number;
  recoveryLifecycleState?: string | null;
  status: ClaimStatus | null;
}) {
  const lifecycleStates: Partial<ReturnType<typeof mapClaimStatusToLifecycleStates>> = params.status
    ? mapClaimStatusToLifecycleStates(params.status)
    : {};

  return {
    caseLifecycleState: params.caseLifecycleState ?? lifecycleStates.caseLifecycleState ?? null,
    claimId: params.claimId ?? 'claim-1',
    legalActionCapPercentage: 25,
    lifecycleVersion: params.lifecycleVersion,
    paymentAuthorizationState: 'authorized',
    recoveryLifecycleState:
      params.recoveryLifecycleState ?? lifecycleStates.recoveryLifecycleState ?? null,
    signedAt: new Date('2026-03-12T09:00:00Z'),
    status: params.status,
  };
}
