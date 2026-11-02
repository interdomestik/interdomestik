import { mocks, mockSaveSelects } from './save-success-fee-collection.shared.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveSuccessFeeCollectionCore } from './save-success-fee-collection';
import {
  createAcceptedAgreement,
  createSession,
  expectSavedCollectionResult,
  runSaveSuccessFeeCollection,
} from './save-success-fee-collection.test-support';
const authority = mintTestTenantAuthority('tenant-1');

describe('saveSuccessFeeCollectionCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txSelect.mockReset();
    mocks.claimSelectChain.from.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.where.mockReturnValue(mocks.claimSelectChain);
    mocks.agreementSelectChain.from.mockReturnValue(mocks.agreementSelectChain);
    mocks.agreementSelectChain.where.mockReturnValue(mocks.agreementSelectChain);
    mocks.subscriptionSelectChain.from.mockReturnValue(mocks.subscriptionSelectChain);
    mocks.subscriptionSelectChain.where.mockReturnValue(mocks.subscriptionSelectChain);
  });

  it('rejects unauthorized callers', async () => {
    const result = await saveSuccessFeeCollectionCore({
      authority,
      claimId: 'claim-1',
      deductionAllowed: false,
      recoveredAmount: 1000,
      session: createSession({ role: 'member', userId: 'member-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Unauthorized',
    });
  });

  it('requires stored agreement terms before saving success-fee collection details', async () => {
    mockSaveSelects({
      agreement: [createAcceptedAgreement({ feePercentage: null })],
    });

    const result = await runSaveSuccessFeeCollection({
      deductionAllowed: true,
      recoveredAmount: 100,
    });

    expect(result).toEqual({
      success: false,
      error: 'Save the accepted escalation agreement before recording success-fee collection.',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('denies saving success-fee collection for claims outside the acting staff scope', async () => {
    mockSaveSelects({
      claim: [],
    });

    const result = await runSaveSuccessFeeCollection();

    expect(result).toEqual({
      success: false,
      error: 'Claim not found or access denied',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('rejects accepted cases whose agreement snapshot is still incomplete', async () => {
    mockSaveSelects({
      agreement: [
        createAcceptedAgreement({
          acceptedAt: new Date('2026-03-14T09:00:00.000Z'),
          decisionReason: 'Recovery decision accepted before commercial terms were fully saved.',
          signedAt: null,
        }),
      ],
    });

    const result = await runSaveSuccessFeeCollection();

    expect(result).toEqual({
      success: false,
      error: 'Save the accepted escalation agreement before recording success-fee collection.',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('stores a deduction plan when payout deduction is legally allowed', async () => {
    const now = new Date('2026-03-12T09:00:00Z');
    mockSaveSelects();

    const result = await runSaveSuccessFeeCollection({
      deductionAllowed: true,
      now,
      recoveredAmount: 100,
    });

    expect(mocks.txUpdate).toHaveBeenCalledWith(mocks.claimEscalationAgreements);
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        successFeeAmount: '25.00',
        successFeeCollectionMethod: 'deduction',
        successFeeCurrencyCode: 'EUR',
        successFeeDeductionAllowed: true,
        successFeeHasStoredPaymentMethod: false,
        successFeeInvoiceDueAt: null,
        successFeeRecoveredAmount: '100.00',
        successFeeResolvedById: 'staff-1',
        successFeeResolvedAt: now,
        successFeeSubscriptionId: null,
      })
    );
    expectSavedCollectionResult(result, {
      collectionMethod: 'deduction',
      deductionAllowed: true,
      feeAmount: '25.00',
      hasStoredPaymentMethod: false,
      invoiceDueAt: null,
      paymentAuthorizationState: 'authorized',
      recoveredAmount: '100.00',
      resolvedAt: '2026-03-12T09:00:00.000Z',
      subscriptionId: null,
    });
  });
});
