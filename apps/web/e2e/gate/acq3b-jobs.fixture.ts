import {
  eq,
  inArray,
  sponsorRosterEntries,
  sponsors,
  sponsorTerms,
  subscriptions,
} from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { resolveEffectiveMembership } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import {
  planCacheStatuses,
  runSponsorCacheJob,
} from '@interdomestik/domain-membership-billing/sponsors/cache-job';
import { queueEndOffers } from '@interdomestik/domain-membership-billing/sponsors/mail-producers';
import { runSponsorProvisioning } from '@interdomestik/domain-membership-billing/sponsors/sponsor-jobs';
import { expect } from '@playwright/test';
import type { SponsorFixture } from './acq3b-context.fixture';

// The exports are tenant-wide. Refuse before invoking them if they could mutate somebody else's
// fixture; never snapshot/restore or delete another test's work to make these jobs pass.
export async function assertOwnedJobWork(f: SponsorFixture): Promise<void> {
  await withTenantAuthority(f.authority, async tx => {
    const entries = await tx
      .select({ leadId: sponsors.sourceLeadId })
      .from(sponsorRosterEntries)
      .innerJoin(sponsorTerms, eq(sponsorTerms.id, sponsorRosterEntries.termId))
      .innerJoin(sponsors, eq(sponsors.id, sponsorTerms.sponsorId))
      .where(eq(sponsorRosterEntries.tenantId, f.tenantId));
    expect(
      entries.every(row => f.leadIds.includes(row.leadId)),
      'tenant-wide jobs require exclusively owned sponsor entries'
    ).toBe(true);
    const cached = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, f.tenantId));
    const foreign = cached.filter(
      row =>
        ![f.member.id, f.paying.id, f.other.id].includes(row.userId) &&
        row.provider === 'group_sponsor'
    );
    const coverage = await resolveEffectiveMembership(
      tx,
      f.tenantId,
      foreign.map(row => row.userId),
      new Date()
    );
    expect(
      planCacheStatuses(
        foreign,
        [...coverage].map(([userId, membership]) => ({ userId, membership }))
      ),
      'cache job must not rewrite seeded golden rows'
    ).toEqual([]);
  });
}

export async function provisionOwnedRoster(f: SponsorFixture): Promise<void> {
  // Provisioning doesn't update unrelated display caches; only admission candidates need isolation.
  await withTenantAuthority(f.authority, async tx => {
    const ownTerms = tx
      .select({ id: sponsorTerms.id })
      .from(sponsorTerms)
      .innerJoin(sponsors, eq(sponsors.id, sponsorTerms.sponsorId))
      .where(eq(sponsors.sourceLeadId, f.leadId));
    const all = await tx
      .select({ id: sponsorRosterEntries.id })
      .from(sponsorRosterEntries)
      .where(eq(sponsorRosterEntries.tenantId, f.tenantId));
    const own = await tx
      .select({ id: sponsorRosterEntries.id })
      .from(sponsorRosterEntries)
      .where(inArray(sponsorRosterEntries.termId, ownTerms));
    expect(all.map(row => row.id).sort(), 'provisioning cannot touch another fixture').toEqual(
      own.map(row => row.id).sort()
    );
  });
  const result = await runSponsorProvisioning(f.authority, { now: new Date() });
  expect(result.disabled).toBeUndefined();
  expect(result.failed).toBe(0);
  expect(result.processed).toBe(4);
}

export async function runEndJobs(f: SponsorFixture): Promise<void> {
  await assertOwnedJobWork(f);
  await runSponsorCacheJob(f.authority, { now: new Date() });
  await queueEndOffers(f.authority, new Date());
  // A second pass must not queue a second offer.
  await queueEndOffers(f.authority, new Date());
}
