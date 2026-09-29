import { expect } from 'vitest';
import type { ClaimsSession } from '../claims/types';
import { withClaimLifecycle } from '../claims/lifecycle-test-support';
import {
  mocks,
  READY_ACCEPTED_RECOVERY_RECORD,
  STANDARD_SUBSCRIPTION,
  type MockRecoveryAgreement,
} from './update-status-test-core';
import { updateClaimStatusCore } from './update-status';

export function createSession(options: {
  userId: string;
  branchId?: string | null;
  role?: string;
  tenantId?: string;
}): ClaimsSession {
  const user = {
    id: options.userId,
    role: options.role ?? 'staff',
    tenantId: options.tenantId ?? 'tenant-1',
  };

  if (options.branchId === undefined) {
    return { user } as unknown as ClaimsSession;
  }

  return {
    user: { ...user, branchId: options.branchId },
  } as unknown as ClaimsSession;
}

export function mockRecoverySelects(options?: {
  agreement?: Array<MockRecoveryAgreement>;
  claim?: Array<{
    id: string;
    status: string;
    userId: string;
    category: string;
    title?: string;
    staffId?: string | null;
  }>;
  existingClaimUsage?: Array<{ id: string }>;
  matterCount?: Array<{ count: number }>;
  subscription?: Array<typeof STANDARD_SUBSCRIPTION>;
}) {
  mocks.txSelect
    .mockReturnValueOnce(mocks.agreementSelectChain)
    .mockReturnValueOnce(mocks.subscriptionSelectChain)
    .mockReturnValueOnce(mocks.serviceUsageCountSelectChain)
    .mockReturnValueOnce(mocks.serviceUsageExistsSelectChain);
  mocks.tenantReadSelectChain.limit.mockResolvedValue(
    (
      options?.claim ?? [
        {
          id: 'claim-1',
          status: 'evaluation',
          userId: 'member-1',
          category: 'vehicle',
          title: 'Vehicle claim',
          staffId: null,
        },
      ]
    ).map(withClaimLifecycle)
  );
  mocks.agreementSelectChain.limit.mockResolvedValue(
    options?.agreement ?? [READY_ACCEPTED_RECOVERY_RECORD]
  );
  mocks.subscriptionSelectChain.limit.mockResolvedValue(
    options?.subscription ?? [STANDARD_SUBSCRIPTION]
  );
  mocks.serviceUsageCountSelectChain.limit.mockResolvedValue(
    options?.matterCount ?? [{ count: 0 }]
  );
  mocks.serviceUsageExistsSelectChain.limit.mockResolvedValue(options?.existingClaimUsage ?? []);
}
export async function runNegotiationUpdate(
  overrides: Partial<Parameters<typeof updateClaimStatusCore>[0]> = {},
  deps?: Parameters<typeof updateClaimStatusCore>[1]
) {
  return updateClaimStatusCore(
    {
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      ...overrides,
    },
    deps ?? { projectClaimStatusAuditProjection: mocks.projectClaimStatusAuditProjection }
  );
}
export function expectBlockedStatusChange(
  result: Awaited<ReturnType<typeof updateClaimStatusCore>>,
  error: string
) {
  expect(result).toEqual({
    success: false,
    error,
  });
  expect(mocks.txUpdate).not.toHaveBeenCalled();
}
