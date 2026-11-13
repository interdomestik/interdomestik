import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMemberDetailMocks, memberDetailAuthority } from './getMemberClaimDetail-test-support';
import { getMemberClaimDetail } from './getMemberClaimDetail';
import { configureMemberDetailTest } from './getMemberClaimDetail-setup.test-support';

const mocks = getMemberDetailMocks();
const session = { user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' } };

describe('member claim detail pool ordering', () => {
  beforeEach(configureMemberDetailTest);

  it('finishes the authorized directory lookup before opening the tenant transaction', async () => {
    const events: string[] = [];
    const tenant = { code: 'MK', countryCode: 'MK' };
    let finishLookup!: (value: typeof tenant) => void;
    mocks.readTenantLocaleMetadata.mockImplementationOnce(async (tenantId: string) => {
      expect(tenantId).toBe('tenant-1');
      events.push('directory-start');
      const result = await new Promise<typeof tenant>(resolve => {
        finishLookup = resolve;
      });
      events.push('directory-complete');
      return result;
    });
    mocks.context.mockImplementationOnce(() => {
      events.push('transaction-open');
    });
    mocks.claimFindFirst.mockResolvedValueOnce({
      id: 'claim-1',
      userId: 'member-1',
      category: 'vehicle',
      status: 'submitted',
      createdAt: new Date('2026-01-01'),
      documents: [],
    });
    mocks.timelineRows.mockResolvedValueOnce([]);
    mocks.getMemberVaultConsentDisplay.mockImplementationOnce(
      async (_params, authority, tx, metadata) => {
        expect(authority).toBe(memberDetailAuthority);
        expect(tx).toBe(mocks.getMatterAllowanceVisibility.mock.calls[0]![0].tx);
        expect(metadata).toBe(tenant);
        events.push('consent-read');
        return { kind: 'ready', items: [] };
      }
    );

    const pending = getMemberClaimDetail(session, memberDetailAuthority, 'claim-1');
    await vi.waitFor(() => {
      expect(mocks.readTenantLocaleMetadata).toHaveBeenCalledOnce();
    });
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.claimFindFirst).not.toHaveBeenCalled();
    finishLookup(tenant);
    const result = await pending;

    expect(events).toEqual([
      'directory-start',
      'directory-complete',
      'transaction-open',
      'consent-read',
    ]);
    expect(result?.vaultConsentDisplay).toEqual({ kind: 'ready', items: [] });
    expect(mocks.readTenantLocaleMetadata).toHaveBeenCalledOnce();
  });

  it('passes a completed missing-directory result into the transaction', async () => {
    mocks.readTenantLocaleMetadata.mockResolvedValueOnce(null);
    mocks.claimFindFirst.mockResolvedValueOnce({
      id: 'claim-1',
      userId: 'member-1',
      status: 'submitted',
      createdAt: new Date('2026-01-01'),
      documents: [],
    });
    mocks.timelineRows.mockResolvedValueOnce([]);

    const result = await getMemberClaimDetail(session, memberDetailAuthority, 'claim-1');

    expect(mocks.getMemberVaultConsentDisplay.mock.calls[0]?.[3]).toBeNull();
    expect(result?.vaultConsentDisplay).toEqual({ kind: 'hidden' });
  });

  it.each([null, mintTestTenantAuthority('other-tenant')])(
    'denies invalid authority before directory or transaction access',
    async authority => {
      await expect(getMemberClaimDetail(session, authority, 'claim-1')).rejects.toThrow();
      expect(mocks.readTenantLocaleMetadata).not.toHaveBeenCalled();
      expect(mocks.context).not.toHaveBeenCalled();
    }
  );

  it('does not open a tenant transaction if directory lookup fails', async () => {
    mocks.readTenantLocaleMetadata.mockRejectedValueOnce(new Error('directory unavailable'));
    await expect(getMemberClaimDetail(session, memberDetailAuthority, 'claim-1')).rejects.toThrow(
      'directory unavailable'
    );
    expect(mocks.context).not.toHaveBeenCalled();
  });
});
