import {
  and,
  eq,
  inArray,
  memberLeads,
  sponsorMailOutbox,
  sponsorRosterEntries,
  subscriptions,
} from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { resolveEffectiveMembership } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import { expect, test } from '../fixtures/auth.fixture';
import { getLocale, path as routePath } from '../fixtures/routes';
import { gotoApp } from '../utils/navigation';
import { withFreshPage } from './test/login-handoff-page';
import { withSponsorFixture } from './acq3b-context.fixture';
import { runEndJobs } from './acq3b-jobs.fixture';
import { seedEntry, seedSponsor, seedSubscription, seedTerm } from './acq3b-seed.fixture';
import { copy, loginPerson, visible } from './acq3b-ui.fixture';

test('ACQ-3b contiguous renewal survives expiry; only an uncovered person gets one offer', async ({
  browser,
}, info) => {
  test.skip(
    info.project.name !== 'gate-ks-sq',
    'Tenant-wide jobs run once under the fixture lock.'
  );
  test.setTimeout(90_000);
  const locale = getLocale(info);
  if (locale !== 'sq') throw new Error('Expected canonical gate locale');
  await withSponsorFixture(async f => {
    const sponsorId = await seedSponsor(f);
    const boundary = new Date(f.now);
    boundary.setUTCHours(0, 0, 0, 0);
    const oldStart = new Date(boundary.getTime() - 365 * 86_400_000);
    const old = await seedTerm(f, sponsorId, oldStart, boundary);
    const next = await seedTerm(f, sponsorId, boundary, f.end);
    const expired = await seedEntry(f, old.termId, f.member, oldStart);
    await seedEntry(f, old.termId, f.paying, oldStart);
    await seedEntry(f, old.termId, f.other, oldStart);
    // No materialized start: continuity must work from approved contiguous durable terms.
    await seedEntry(f, next.termId, f.paying, null);
    const secondLead = `${f.prefix}-other-lead`;
    f.leadIds.push(secondLead);
    await withTenantAuthority(f.authority, async tx => {
      const original = await tx.query.memberLeads.findFirst({
        where: eq(memberLeads.id, f.leadId),
      });
      if (!original) throw new Error('Missing owned lead');
      await tx
        .insert(memberLeads)
        .values({ ...original, id: secondLead, email: `${secondLead}@example.com` });
    });
    const otherSponsor = await seedSponsor({ ...f, leadId: secondLead });
    const otherTerm = await seedTerm(f, otherSponsor, boundary, f.end);
    await seedEntry(f, otherTerm.termId, f.other, boundary);
    await seedSubscription(f, f.member);
    await seedSubscription(f, f.paying);
    await seedSubscription(f, f.other);
    const people = [f.member.id, f.paying.id, f.other.id];
    const before = await withTenantAuthority(f.authority, tx =>
      resolveEffectiveMembership(tx, f.tenantId, people, new Date())
    );
    expect(before.get(f.member.id)?.source).toBe('none');
    expect(before.get(f.paying.id)?.source).toBe('sponsor');
    expect(before.get(f.other.id)?.source).toBe('sponsor');
    await runEndJobs(f);
    const rows = await withTenantAuthority(f.authority, async tx => ({
      subscriptions: await tx
        .select({ userId: subscriptions.userId, status: subscriptions.status })
        .from(subscriptions)
        .where(inArray(subscriptions.userId, people)),
      // Entry-targeted mail deliberately has userId NULL. Join the entry to assert its recipient.
      offers: await tx
        .select({
          kind: sponsorMailOutbox.kind,
          state: sponsorMailOutbox.state,
          userId: sponsorRosterEntries.userId,
          entryId: sponsorMailOutbox.rosterEntryId,
        })
        .from(sponsorMailOutbox)
        .innerJoin(
          sponsorRosterEntries,
          eq(sponsorRosterEntries.id, sponsorMailOutbox.rosterEntryId)
        )
        .where(
          and(
            inArray(sponsorRosterEntries.userId, people),
            eq(sponsorMailOutbox.kind, 'membership_end_offer')
          )
        ),
    }));
    expect(rows.subscriptions).toEqual(
      expect.arrayContaining([
        { userId: f.member.id, status: 'canceled' },
        { userId: f.paying.id, status: 'active' },
        { userId: f.other.id, status: 'active' },
      ])
    );
    expect(rows.offers).toEqual([
      { kind: 'membership_end_offer', state: 'queued', userId: f.member.id, entryId: expired },
    ]);
    await withFreshPage(browser, info, false, async page => {
      await loginPerson(page, info, f.paying, locale);
      await gotoApp(page, routePath(info, '/member/membership'), info, {
        marker: 'membership-page-ready',
      });
      await expect(visible(page.getByTestId('membership-sponsor-coverage'))).toBeVisible();
      await expect(
        visible(
          page.getByRole('button', {
            name: copy(locale, 'membership', 'sponsorCoverage.leave'),
            exact: true,
          })
        )
      ).toBeVisible();
    });
    await withFreshPage(browser, info, false, async page => {
      await loginPerson(page, info, f.member, locale);
      await gotoApp(page, routePath(info, '/member/membership'), info, {
        marker: 'membership-page-ready',
      });
      await expect(visible(page.getByTestId('membership-sponsor-coverage'))).toHaveCount(0);
      await expect(
        visible(
          page.getByRole('button', {
            name: copy(locale, 'membership', 'sponsorCoverage.leave'),
            exact: true,
          })
        )
      ).toHaveCount(0);
    });
  });
});
