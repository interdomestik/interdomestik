import * as domainSave from '@interdomestik/domain-claims/staff-claims/save-escalation-agreement';
import * as nextCache from 'next/cache';
import { describe, expect, it, vi } from 'vitest';

import { logAuditEvent } from '@/lib/audit';
import { saveClaimEscalationAgreementCore } from './save-escalation-agreement.core';

vi.mock('@interdomestik/domain-claims/staff-claims/save-escalation-agreement', () => ({
  saveClaimEscalationAgreementCore: vi.fn(),
}));

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;
const REVALIDATED_LOCALE_PATHS = [
  ...LOCALES.map(locale => `/${locale}/staff/claims/claim-1`),
  ...LOCALES.map(locale => `/${locale}/staff/claims`),
];

describe('saveClaimEscalationAgreementCore', () => {
  it('revalidates locale-scoped staff claim paths after a successful save', async () => {
    vi.clearAllMocks();
    const requestHeaders = new Headers({ 'user-agent': 'Vitest escalation agreement' });
    const revalidatePathSpy = vi
      .spyOn(nextCache, 'revalidatePath')
      .mockImplementation(() => undefined);

    vi.spyOn(domainSave, 'saveClaimEscalationAgreementCore').mockResolvedValueOnce({
      success: true,
      data: {
        acceptedAt: '2026-03-12T00:00:00.000Z',
        claimId: 'claim-1',
        decisionNextStatus: 'negotiation',
        decisionReason: 'Member accepted negotiation as the next recovery path.',
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
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member accepted negotiation as the next recovery path.',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      requestHeaders,
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
        session: { id: 'session-1' },
      } as never,
      termsVersion: '2026-03-v1',
    });

    expect(result.success).toBe(true);
    const [[domainParams, domainDeps]] = vi.mocked(domainSave.saveClaimEscalationAgreementCore).mock
      .calls;
    expect(domainParams).toMatchObject({
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member accepted negotiation as the next recovery path.',
      requestHeaders,
    });
    expect(domainDeps).toEqual({ logAuditEvent });
    expect(revalidatePathSpy.mock.calls.map(([path]) => path)).toEqual(REVALIDATED_LOCALE_PATHS);
    expect(revalidatePathSpy).toHaveBeenCalledTimes(REVALIDATED_LOCALE_PATHS.length);
  });
});
