import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { getMembershipCoreMocks } from './membership-core-test-support';
import { getMemberLeavableSponsorEntryCore, getMemberSubscriptionsCore } from './_core';

const h = getMembershipCoreMocks();
const row = { id: 'sub-1', provider: 'paddle', status: 'canceled', planId: 'old', plan: null };
const coverage = {
  source: 'sponsor',
  entryId: 'entry-1',
  legalEntityId: 'legal-company',
  planId: 'family',
  planKey: 'family-year',
  windowStart: new Date('2026-01-01'),
  windowEnd: new Date('2027-01-01'),
  coverageEnd: new Date('2028-01-01'),
  lifecycle: { status: 'active', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
};
const args = { userId: 'member-1', tenantId: 'tenant-ks', now: new Date('2026-11-08') };

describe('effective membership workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.authorize.mockResolvedValue(mintTestTenantAuthority('tenant-ks'));
    h.findSubscriptionMany.mockResolvedValue([row]);
    h.findPlan.mockResolvedValue({ id: 'family', name: 'Family' });
  });
  it('source 1 overrides a canceled Paddle row with the sponsor plan, period and controller', async () => {
    h.resolve.mockResolvedValue(new Map([['member-1', coverage]]));
    const [result] = await getMemberSubscriptionsCore(args);
    expect(result).toMatchObject({
      status: 'active',
      planId: 'family',
      currentPeriodStart: coverage.windowStart,
      currentPeriodEnd: coverage.windowEnd,
      canceledAt: null,
      sponsorCoverage: coverage,
      plan: { id: 'family', name: 'Family' },
    });
    expect(h.sponsorDisclosure).toHaveBeenCalledWith(expect.anything(), 'legal-company');
    expect(h.getSubscriptionEntityDisclosureCore).not.toHaveBeenCalled();
    expect(h.resolve).toHaveBeenCalledWith(expect.anything(), 'tenant-ks', ['member-1'], args.now);
  });
  it('source 2 preserves the provider lifecycle', async () => {
    h.resolve.mockResolvedValue(
      new Map([['member-1', { source: 'subscription', subscription: row }]])
    );
    expect(await getMemberSubscriptionsCore(args)).toEqual([
      expect.objectContaining({ status: 'canceled', planId: 'old' }),
    ]);
    expect(h.sponsorDisclosure).not.toHaveBeenCalled();
  });
  it('offers leave for a pending sponsored entry while the paid period runs', async () => {
    h.resolve.mockResolvedValue(
      new Map([['member-1', { source: 'subscription', subscription: row }]])
    );
    h.leavable.mockResolvedValue(['pending-entry']);
    expect(await getMemberSubscriptionsCore(args)).toEqual([
      expect.objectContaining({ sponsorLeaveEntryId: 'pending-entry' }),
    ]);
    expect(h.leavable).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-ks',
      'member-1',
      expect.any(Date)
    );
  });
  it('source 3 makes a legacy active sponsor row inactive', async () => {
    h.findSubscriptionMany.mockResolvedValue([
      { ...row, status: 'active', provider: 'group_sponsor' },
    ]);
    h.resolve.mockResolvedValue(new Map([['member-1', { source: 'none' }]]));
    expect(await getMemberSubscriptionsCore(args)).toEqual([
      expect.objectContaining({ status: 'expired' }),
    ]);
  });
  it('source 3 with no row returns the empty workspace', async () => {
    h.findSubscriptionMany.mockResolvedValue([]);
    h.resolve.mockResolvedValue(new Map([['member-1', { source: 'none' }]]));
    expect(await getMemberSubscriptionsCore(args)).toEqual([]);
  });
  it('reads a leavable future sponsorship without any subscription row', async () => {
    h.leavable.mockResolvedValue(['future-entry']);
    expect(await getMemberLeavableSponsorEntryCore(args)).toBe('future-entry');
    h.leavable.mockResolvedValue([]);
    expect(await getMemberLeavableSponsorEntryCore(args)).toBeNull();
    h.authorize.mockResolvedValue(mintTestTenantAuthority('tenant-other'));
    h.leavable.mockClear();
    expect(await getMemberLeavableSponsorEntryCore(args)).toBeNull();
    expect(h.leavable).not.toHaveBeenCalled();
  });
  it.each([null, mintTestTenantAuthority('tenant-other')])(
    'refuses absent or mismatched session authority',
    async authority => {
      h.authorize.mockResolvedValue(authority);
      expect(await getMemberSubscriptionsCore(args)).toEqual([]);
      expect(h.resolve).not.toHaveBeenCalled();
      expect(h.findSubscriptionMany).not.toHaveBeenCalled();
    }
  );
});
