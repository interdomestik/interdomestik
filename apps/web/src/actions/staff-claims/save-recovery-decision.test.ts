import * as domainSave from '@interdomestik/domain-claims';
import * as nextCache from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logAuditEvent } from '@/lib/audit';
import { saveRecoveryDecisionCore } from './save-recovery-decision.core';

const mockRunCommercialActionWithIdempotency = vi.fn();

vi.mock('@interdomestik/domain-claims', () => ({
  saveStaffRecoveryDecisionCore: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/commercial-action-idempotency', () => ({
  runCommercialActionWithIdempotency: (...args: unknown[]) =>
    mockRunCommercialActionWithIdempotency(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('saveRecoveryDecisionCore', () => {
  const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;
  const REVALIDATED_LOCALE_PATHS = [
    ...LOCALES.map(locale => `/${locale}/staff/claims/claim-1`),
    ...LOCALES.map(locale => `/${locale}/staff/claims`),
    ...LOCALES.map(locale => `/${locale}/member/claims/claim-1`),
    ...LOCALES.map(locale => `/${locale}/member/claims`),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunCommercialActionWithIdempotency.mockImplementation(async ({ execute }) => execute());
  });

  it('uses business inputs for idempotency and revalidates staff and member claim paths', async () => {
    const requestHeaders = new Headers({ 'user-agent': 'Vitest recovery decision' });
    const revalidatePathSpy = vi
      .spyOn(nextCache, 'revalidatePath')
      .mockImplementation(() => undefined);

    vi.spyOn(domainSave, 'saveStaffRecoveryDecisionCore').mockResolvedValueOnce({
      success: true,
      data: {
        decidedAt: '2026-03-12T00:00:00.000Z',
        declineReasonCode: 'insufficient_evidence',
        explanation: 'Not enough evidence for staff-led recovery.',
        memberDescription: 'We could not confirm enough evidence to pursue staff-led recovery.',
        memberLabel: 'Declined for staff-led recovery',
        staffLabel: 'Declined for staff-led recovery',
        status: 'declined',
      },
    });

    const result = await saveRecoveryDecisionCore({
      claimId: 'claim-1',
      decisionType: 'declined',
      declineReasonCode: 'insufficient_evidence',
      explanation: 'Not enough evidence for staff-led recovery.',
      idempotencyKey: 'decision-1',
      requestHeaders,
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
        session: { id: 'session-1' },
      } as never,
    });

    expect(result.success).toBe(true);
    expect(mockRunCommercialActionWithIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'staff-claims.save-recovery-decision',
        actorUserId: 'staff-1',
        tenantId: 'tenant-1',
        idempotencyKey: 'decision-1',
        requestFingerprint: {
          claimId: 'claim-1',
          decisionType: 'declined',
          declineReasonCode: 'insufficient_evidence',
          explanation: 'Not enough evidence for staff-led recovery.',
        },
      })
    );

    const [[domainParams, domainDeps]] = vi.mocked(domainSave.saveStaffRecoveryDecisionCore).mock
      .calls;
    expect(domainParams).toMatchObject({
      claimId: 'claim-1',
      decisionType: 'declined',
      declineReasonCode: 'insufficient_evidence',
      explanation: 'Not enough evidence for staff-led recovery.',
      requestHeaders,
    });
    expect(domainDeps).toEqual({ logAuditEvent });
    expect(revalidatePathSpy.mock.calls.map(([path]) => path)).toEqual(REVALIDATED_LOCALE_PATHS);
    expect(revalidatePathSpy).toHaveBeenCalledTimes(REVALIDATED_LOCALE_PATHS.length);
  });
});
