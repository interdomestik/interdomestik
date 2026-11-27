import { UnauthorizedError } from '@interdomestik/shared-auth/errors';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
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

  it('refuses before the Vault evidence read when the authority has no principal', async () => {
    hoisted.admit.mockResolvedValueOnce({
      ok: true,
      authorized: { session: memberSession, authority: mintTestTenantAuthority('tenant-1') },
    });
    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim-vault',
      userId: 'member-1',
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
    hoisted.timelineRows.mockResolvedValueOnce([]);
    await expect(getMemberClaimDetail('claim-vault')).rejects.toThrow(UnauthorizedError);
    expect(hoisted.readCurrentMemberVaultEvidence).not.toHaveBeenCalled();
    expect(hoisted.getMemberVaultConsentDisplay).not.toHaveBeenCalled();
  });

  it('adds the safe Vault display after resolving the member-owned claim', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce({
      id: 'claim-vault',
      userId: 'member-1',
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
    hoisted.timelineRows.mockResolvedValueOnce([]);
    const evidence = [{ id: 'document-1', category: 'evidence' as const, createdAt: null }];
    hoisted.readCurrentMemberVaultEvidence.mockResolvedValueOnce(evidence);
    hoisted.getMemberVaultConsentDisplay.mockResolvedValueOnce({ kind: 'ready', items: [] });
    const result = await getMemberClaimDetail('claim-vault');
    const tx = expect.objectContaining({
      query: { claims: { findFirst: hoisted.claimFindFirst } },
    });
    expect(hoisted.readCurrentMemberVaultEvidence).toHaveBeenCalledWith(
      tx,
      'tenant-1',
      'claim-vault',
      'member-1'
    );
    expect(hoisted.getMemberVaultConsentDisplay).toHaveBeenCalledWith(
      {
        memberId: 'member-1',
        claimId: 'claim-vault',
        claimCategory: 'vehicle',
        piiStatus: 'available',
      },
      { database: tx, evidence }
    );
    expect(result?.vaultConsentDisplay).toEqual({ kind: 'ready', items: [] });
    const [, sentryOptions] = hoisted.withServerActionInstrumentation.mock.calls[0]!;
    expect(sentryOptions).toEqual({ recordResponse: false });
  });
});
