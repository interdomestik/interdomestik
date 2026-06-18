import type { ClaimStatus } from '@interdomestik/database/constants';

export function authorizedRecoveryReadRow(params: {
  claimId?: string;
  lifecycleVersion: number;
  status: ClaimStatus | null;
}) {
  return {
    claimId: params.claimId ?? 'claim-1',
    legalActionCapPercentage: 25,
    lifecycleVersion: params.lifecycleVersion,
    paymentAuthorizationState: 'authorized',
    signedAt: new Date('2026-03-12T09:00:00Z'),
    status: params.status,
  };
}
