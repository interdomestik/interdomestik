import { mocks, mockSaveSelects } from './save-success-fee-collection.shared.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authority,
  createAcceptedAgreement,
  expectSavedCollectionResult,
  runSaveSuccessFeeCollection,
} from './save-success-fee-collection.test-support';
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

  it('uses the stored payment-method charge path when deduction is unavailable and a saved method exists', async () => {
    const now = new Date('2026-03-12T09:00:00Z');
    mockSaveSelects({
      subscription: [{ id: 'sub-1', providerCustomerId: 'cus_123' }],
    });

    const result = await runSaveSuccessFeeCollection({ now });

    expectSavedCollectionResult(result, {
      collectionMethod: 'payment_method_charge',
      deductionAllowed: false,
      feeAmount: '150.00',
      hasStoredPaymentMethod: true,
      invoiceDueAt: null,
      paymentAuthorizationState: 'authorized',
      recoveredAmount: '1000.00',
      resolvedAt: '2026-03-12T09:00:00.000Z',
      subscriptionId: 'sub-1',
    });
  });

  it('falls back to a seven-day invoice when the saved payment-method path is unavailable', async () => {
    const now = new Date('2026-03-12T09:00:00Z');
    mockSaveSelects({
      agreement: [createAcceptedAgreement({ paymentAuthorizationState: 'revoked' })],
      subscription: [{ id: 'sub-1', providerCustomerId: null }],
    });

    const result = await runSaveSuccessFeeCollection({ now });

    expectSavedCollectionResult(result, {
      collectionMethod: 'invoice',
      deductionAllowed: false,
      feeAmount: '150.00',
      hasStoredPaymentMethod: false,
      invoiceDueAt: '2026-03-19T09:00:00.000Z',
      paymentAuthorizationState: 'revoked',
      recoveredAmount: '1000.00',
      resolvedAt: '2026-03-12T09:00:00.000Z',
      subscriptionId: null,
    });
  });

  it('records a commercial audit event when success-fee collection details are saved', async () => {
    const now = new Date('2026-03-12T09:00:00Z');
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

    mockSaveSelects();

    const result = await runSaveSuccessFeeCollection(
      {
        deductionAllowed: true,
        now,
        recoveredAmount: 100,
        requestHeaders,
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result.success).toBe(true);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.success_fee_collection_saved',
        actorId: 'staff-1',
        actorRole: 'staff',
        entityId: 'claim-1',
        entityType: 'claim',
        headers: requestHeaders,
        authority,
        metadata: expect.objectContaining({
          collectionMethod: 'deduction',
          currencyCode: 'EUR',
          deductionAllowed: true,
          feeAmount: '25.00',
          recoveredAmount: '100.00',
        }),
      })
    );
  });

  it('blocks guidance-only matters from saving success-fee collection', async () => {
    mockSaveSelects({
      claim: [{ category: 'travel', currency: 'EUR', id: 'claim-1', userId: 'member-1' }],
    });

    const result = await runSaveSuccessFeeCollection();

    expect(result).toEqual({
      success: false,
      error:
        'This matter stays guidance-only or referral-only under the current launch scope and cannot move into staff-led recovery or success-fee handling.',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });
});
