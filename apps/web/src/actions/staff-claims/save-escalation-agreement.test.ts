import * as domainSave from '@interdomestik/domain-claims/staff-claims/save-escalation-agreement';
import * as nextCache from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveClaimEscalationAgreementCore } from './save-escalation-agreement.core';

vi.mock('@interdomestik/domain-claims/staff-claims/save-escalation-agreement', () => ({
  saveClaimEscalationAgreementCore: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('saveClaimEscalationAgreementCore', () => {
  const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revalidates locale-scoped staff claim paths after a successful save', async () => {
    vi.spyOn(domainSave, 'saveClaimEscalationAgreementCore').mockResolvedValueOnce({
      success: true,
      data: {
        acceptedAt: '2026-03-12T00:00:00.000Z',
        claimId: 'claim-1',
        feePercentage: 15,
        legalActionCapPercentage: 25,
        minimumFee: '25.00',
        paymentAuthorizationState: 'authorized',
        signedAt: '2026-03-12T00:00:00.000Z',
        termsVersion: '2026-03-v1',
      },
    });

    const result = await saveClaimEscalationAgreementCore({
      claimId: 'claim-1',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
        session: { id: 'session-1' },
      } as never,
      termsVersion: '2026-03-v1',
    });

    expect(result.success).toBe(true);
    for (const locale of LOCALES) {
      expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/${locale}/staff/claims/claim-1`);
      expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/${locale}/staff/claims`);
    }
    expect(nextCache.revalidatePath).toHaveBeenCalledTimes(LOCALES.length * 2);
  });
});
