import { UnauthorizedError } from '@interdomestik/shared-auth/errors';
import { beforeEach, describe, expect, it } from 'vitest';

import { getMemberDetailMocks, memberDetailAuthority } from './getMemberClaimDetail-test-support';
import { getMemberClaimDetail } from './getMemberClaimDetail';
import { configureMemberDetailTest } from './getMemberClaimDetail-setup.test-support';

const hoisted = getMemberDetailMocks();

const memberSession = {
  user: {
    id: 'member-1',
    role: 'member',
    tenantId: 'tenant-1',
  },
} as const;

describe('getMemberClaimDetail Vault evidence', () => {
  beforeEach(() => {
    configureMemberDetailTest();
    hoisted.admit.mockResolvedValue({
      ok: true,
      authorized: { session: memberSession, authority: memberDetailAuthority },
    });
  });

  const vaultClaim = (piiUserId = 'member-1') => ({
    id: 'claim-vault',
    userId: piiUserId,
    category: 'vehicle',
    title: 'Vehicle evidence',
    status: 'evaluation',
    createdAt: new Date('2026-07-01Z'),
    updatedAt: null,
    description: null,
    claimAmount: null,
    currency: 'EUR',
    documents: [],
  });

  it.each([
    ['member-1', 'available', { kind: 'hidden' }],
    ['[erased]', 'erased_or_unavailable', { kind: 'subject_erased' }],
  ])(
    'skips the Vault evidence read when the gate is closed (%s)',
    async (claimUserId, piiStatus, display) => {
      hoisted.claimFindFirst.mockResolvedValueOnce(vaultClaim(claimUserId));
      hoisted.timelineRows.mockResolvedValueOnce([]);
      hoisted.openMemberVaultConsentDisplay.mockResolvedValueOnce({ open: false, display });
      const result = await getMemberClaimDetail('claim-vault');
      expect(hoisted.openMemberVaultConsentDisplay).toHaveBeenCalledWith(
        expect.objectContaining({ claimId: 'claim-vault', piiStatus })
      );
      expect(hoisted.readCurrentMemberVaultEvidence).not.toHaveBeenCalled();
      expect(hoisted.completeMemberVaultConsentDisplay).not.toHaveBeenCalled();
      expect(result?.vaultConsentDisplay).toEqual(display);
    }
  );

  it('propagates a refused Vault gate before any evidence read', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce(vaultClaim());
    hoisted.timelineRows.mockResolvedValueOnce([]);
    hoisted.openMemberVaultConsentDisplay.mockRejectedValueOnce(new UnauthorizedError());
    await expect(getMemberClaimDetail('claim-vault')).rejects.toThrow(UnauthorizedError);
    expect(hoisted.readCurrentMemberVaultEvidence).not.toHaveBeenCalled();
    expect(hoisted.completeMemberVaultConsentDisplay).not.toHaveBeenCalled();
  });

  it('reads the viewer-bound evidence in the claim transaction once the gate is open', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce(vaultClaim());
    hoisted.timelineRows.mockResolvedValueOnce([]);
    const gate = {
      open: true,
      display: { kind: 'ready', items: [] },
      tenantId: 'tenant-1',
      viewerId: 'viewer-1',
      tenant: { code: 'MK', countryCode: 'MK' },
    };
    hoisted.openMemberVaultConsentDisplay.mockResolvedValueOnce(gate);
    const evidence = [{ id: 'document-1', category: 'evidence' as const, createdAt: null }];
    hoisted.readCurrentMemberVaultEvidence.mockResolvedValueOnce(evidence);
    const display = { kind: 'ready', items: [{ documentId: 'document-1' }] };
    hoisted.completeMemberVaultConsentDisplay.mockResolvedValueOnce(display);
    const result = await getMemberClaimDetail('claim-vault');
    const params = {
      memberId: 'member-1',
      claimId: 'claim-vault',
      claimCategory: 'vehicle',
      piiStatus: 'available',
    };
    expect(hoisted.openMemberVaultConsentDisplay).toHaveBeenCalledWith(params);
    const tx = hoisted.getMatterAllowanceVisibility.mock.calls[0]![0].tx;
    expect(hoisted.readCurrentMemberVaultEvidence).toHaveBeenCalledWith(
      tx,
      'tenant-1',
      'claim-vault',
      'viewer-1'
    );
    expect(hoisted.completeMemberVaultConsentDisplay).toHaveBeenCalledWith(
      params,
      gate,
      tx,
      evidence
    );
    expect(result?.vaultConsentDisplay).toEqual(display);
    const [, sentryOptions] = hoisted.withServerActionInstrumentation.mock.calls[0]!;
    expect(sentryOptions).toEqual({ recordResponse: false });
  });
});
