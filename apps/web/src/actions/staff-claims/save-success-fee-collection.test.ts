import * as domainSave from '@interdomestik/domain-claims/staff-claims/save-success-fee-collection';
import * as nextCache from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveSuccessFeeCollectionCore } from './save-success-fee-collection.core';

vi.mock('@interdomestik/domain-claims/staff-claims/save-success-fee-collection', () => ({
  saveSuccessFeeCollectionCore: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('saveSuccessFeeCollectionCore', () => {
  const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revalidates locale-scoped staff claim paths after a successful save', async () => {
    vi.spyOn(domainSave, 'saveSuccessFeeCollectionCore').mockResolvedValueOnce({
      success: true,
      data: {
        claimId: 'claim-1',
        collectionMethod: 'payment_method_charge',
        currencyCode: 'EUR',
        deductionAllowed: false,
        feeAmount: '150.00',
        hasStoredPaymentMethod: true,
        invoiceDueAt: null,
        paymentAuthorizationState: 'authorized',
        recoveredAmount: '1000.00',
        resolvedAt: '2026-03-12T00:00:00.000Z',
        subscriptionId: 'sub-1',
      },
    });

    const result = await saveSuccessFeeCollectionCore({
      claimId: 'claim-1',
      deductionAllowed: false,
      recoveredAmount: 1000,
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
        session: { id: 'session-1' },
      } as never,
    });

    expect(result.success).toBe(true);
    for (const locale of LOCALES) {
      expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/${locale}/staff/claims/claim-1`);
      expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/${locale}/staff/claims`);
    }
    expect(nextCache.revalidatePath).toHaveBeenCalledTimes(LOCALES.length * 2);
  });
});
