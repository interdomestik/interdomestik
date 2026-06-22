import type { ClaimStatus } from '@interdomestik/database/constants';
import { mapClaimStatusToLifecycleStates } from './lifecycle-state';

type LifecycleFixtureStatus = ClaimStatus | string | null;

export function withClaimLifecycle<T extends { status: LifecycleFixtureStatus }>(claim: T): T {
  if (!claim.status) return claim;
  if (!isClaimStatusFixture(claim.status)) return claim;
  return { ...mapClaimStatusToLifecycleStates(claim.status), ...claim };
}

export function claimFixture(
  status: ClaimStatus,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return withClaimLifecycle({
    id: 'claim-1',
    userId: 'member-1',
    category: 'vehicle',
    status,
    ...overrides,
  });
}

export function transitionClaimFixture(
  status: ClaimStatus | null,
  lifecycleVersion = 1
): Record<string, unknown> {
  return withClaimLifecycle({ id: 'claim-1', lifecycleVersion, status });
}

function isClaimStatusFixture(value: string): value is ClaimStatus {
  return [
    'draft',
    'submitted',
    'verification',
    'evaluation',
    'negotiation',
    'court',
    'resolved',
    'rejected',
  ].includes(value);
}
