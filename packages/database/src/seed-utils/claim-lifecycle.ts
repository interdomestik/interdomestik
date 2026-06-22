import type { ClaimStatus } from '../constants';
import { claimLifecycleFieldsForStatus } from '../claim-lifecycle';

type ClaimSeedRow = {
  caseLifecycleState?: unknown;
  recoveryLifecycleState?: unknown;
  status?: ClaimStatus | null;
  [key: string]: unknown;
};

export function withClaimLifecycleFields<T extends ClaimSeedRow>(claim: T): T {
  if (!claim.status) return claim;
  return { ...claim, ...claimLifecycleFieldsForStatus(claim.status) };
}
