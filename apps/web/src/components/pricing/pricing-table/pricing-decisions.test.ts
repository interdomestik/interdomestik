import type { SponsorCoverage } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import { describe, expect, it } from 'vitest';
import { getSponsorCheckoutNotice, shouldOpenSelfServePrecheckout } from './pricing-decisions';

const covering: SponsorCoverage = {
  source: 'sponsor',
  entryId: 'entry',
  termId: 'term',
  sponsorId: 'company',
  legalEntityId: 'entity',
  planId: 'standard',
  planKey: 'standard-year',
  windowStart: new Date('2026-01-01'),
  windowEnd: new Date('2027-01-01'),
  coverageEnd: new Date('2028-01-01'),
  lifecycle: { status: 'active', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
};
describe('sponsor checkout decisions', () => {
  it('source 1 blocks checkout and uses the contiguous coverage end', () => {
    const sponsorOutlook = { covering, nextStart: new Date('2027-01-01') };
    expect(shouldOpenSelfServePrecheckout({ planId: 'standard', sponsorOutlook })).toBe(false);
    expect(getSponsorCheckoutNotice(sponsorOutlook)).toEqual({
      key: 'coveredUntil',
      date: covering.coverageEnd,
    });
  });
  it('blocks checkout before a later sponsor start', () => {
    const sponsorOutlook = { covering: null, nextStart: new Date('2027-01-01') };
    expect(shouldOpenSelfServePrecheckout({ planId: 'family', sponsorOutlook })).toBe(false);
    expect(getSponsorCheckoutNotice(sponsorOutlook)).toEqual({
      key: 'startsOn',
      date: sponsorOutlook.nextStart,
    });
  });
  it.each(['subscription', 'none'])(
    'keeps self-serve pricing for source %s without sponsorship',
    () => {
      const sponsorOutlook = { covering: null, nextStart: null };
      expect(shouldOpenSelfServePrecheckout({ planId: 'standard', sponsorOutlook })).toBe(true);
      expect(getSponsorCheckoutNotice(sponsorOutlook)).toBeNull();
    }
  );
});
