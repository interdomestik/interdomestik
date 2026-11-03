import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { expect } from 'vitest';

import type { ClaimsSession } from '../claims/types';
import { saveSuccessFeeCollectionCore } from './save-success-fee-collection';

export type MockClaimRecord = {
  category: string;
  currency: string;
  id: string;
  userId: string;
};

export type MockAgreementRecord = {
  acceptedAt: Date | null;
  decisionNextStatus: 'negotiation' | 'court' | null;
  decisionReason: string | null;
  feePercentage: number | null;
  legalActionCapPercentage: number | null;
  minimumFee: string | null;
  paymentAuthorizationState: string | null;
  signedAt: Date | null;
  termsVersion: string | null;
};

export type MockSubscriptionRecord = {
  id: string;
  providerCustomerId: string | null;
};
export const READY_ACCEPTED_AGREEMENT: MockAgreementRecord = {
  acceptedAt: new Date('2026-03-12T09:00:00Z'),
  decisionNextStatus: 'negotiation',
  decisionReason: 'Member approved the accepted negotiation path.',
  feePercentage: 15,
  legalActionCapPercentage: 25,
  minimumFee: '25.00',
  paymentAuthorizationState: 'authorized',
  signedAt: new Date('2026-03-12T09:00:00Z'),
  termsVersion: '2026-03-v1',
};
export function createSession(options: {
  userId: string;
  role?: string;
  tenantId?: string;
}): ClaimsSession {
  return {
    user: {
      id: options.userId,
      role: options.role ?? 'staff',
      tenantId: options.tenantId ?? 'tenant-1',
    },
  } as unknown as ClaimsSession;
}

export function createAcceptedAgreement(
  overrides: Partial<MockAgreementRecord> = {}
): MockAgreementRecord {
  return {
    ...READY_ACCEPTED_AGREEMENT,
    ...overrides,
  };
}
export const authority: TenantAuthority = mintTestTenantAuthority('tenant-1');

export async function runSaveSuccessFeeCollection(
  overrides: Partial<Parameters<typeof saveSuccessFeeCollectionCore>[0]> = {},
  deps?: Parameters<typeof saveSuccessFeeCollectionCore>[1]
) {
  return saveSuccessFeeCollectionCore(
    {
      authority,
      claimId: 'claim-1',
      deductionAllowed: false,
      recoveredAmount: 1000,
      session: createSession({ userId: 'staff-1' }),
      ...overrides,
    },
    deps
  );
}

export function expectSavedCollectionResult(
  result: Awaited<ReturnType<typeof saveSuccessFeeCollectionCore>>,
  expectedData: Record<string, unknown>
) {
  expect(result).toEqual({
    success: true,
    data: {
      claimId: 'claim-1',
      currencyCode: 'EUR',
      ...expectedData,
    },
  });
}
