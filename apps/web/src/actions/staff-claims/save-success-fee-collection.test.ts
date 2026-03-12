import * as domainSave from '@interdomestik/domain-claims/staff-claims/save-success-fee-collection';
import * as nextCache from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logAuditEvent } from '@/lib/audit';
import { saveSuccessFeeCollectionCore } from './save-success-fee-collection.core';

vi.mock('@interdomestik/domain-claims/staff-claims/save-success-fee-collection', () => ({
  saveSuccessFeeCollectionCore: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
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
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

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
      requestHeaders,
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
        session: { id: 'session-1' },
      } as never,
    });

    expect(result.success).toBe(true);
    const [[domainParams, domainDeps]] = vi.mocked(domainSave.saveSuccessFeeCollectionCore).mock
      .calls;
    expect(domainParams).toMatchObject({
      claimId: 'claim-1',
      requestHeaders,
    });
    expect(domainDeps).toEqual({ logAuditEvent });
    const revalidatePathMock = vi.mocked(nextCache.revalidatePath);
    expect(
      revalidatePathMock.mock.calls.map(
        ([path]: Parameters<typeof nextCache.revalidatePath>) => path
      )
    ).toEqual([
      ...LOCALES.map(locale => `/${locale}/staff/claims/claim-1`),
      ...LOCALES.map(locale => `/${locale}/staff/claims`),
    ]);
    expect(revalidatePathMock).toHaveBeenCalledTimes(LOCALES.length * 2);
  });
});
