import type { ClaimStatus } from '../constants';
import { claimLifecycleFieldsForStatus } from '../claim-lifecycle';

type ClaimSeedRow = {
  caseLifecycleState?: unknown;
  recoveryLifecycleState?: unknown;
  status?: ClaimStatus | null;
  [key: string]: unknown;
};

type ClaimLifecycleFields = ReturnType<typeof claimLifecycleFieldsForStatus>;

export function withClaimLifecycleFields<T extends ClaimSeedRow>(
  claim: T
): Omit<T, 'status'> & Partial<ClaimLifecycleFields> {
  const { status, ...claimWithoutStatus } = claim;
  if (!status) return claimWithoutStatus;
  return { ...claimWithoutStatus, ...claimLifecycleFieldsForStatus(status) };
}
