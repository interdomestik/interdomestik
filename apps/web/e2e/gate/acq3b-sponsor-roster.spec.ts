import {
  claims,
  eq,
  sponsors,
  sponsorRosterEntries,
  sponsorTermRevisions,
  user,
} from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { expect, test } from '../fixtures/auth.fixture';
import { path as routePath } from '../fixtures/routes';
import { gotoApp } from '../utils/navigation';
import { withFreshPage } from './test/login-handoff-page';
import { withSponsorFixture } from './acq3b-context.fixture';
import { provisionOwnedRoster } from './acq3b-jobs.fixture';
import { readTerms, seedSubscription } from './acq3b-seed.fixture';
import { actionForm, copy, loginPerson, rosterRow, tabTo, visible } from './acq3b-ui.fixture';

test('ACQ-3b office agent creates a contract; independent staff approves; CSV preserves privacy', async ({
  browser,
}, info) => {
  // This fixture is provisioned in one project only; other projects skip it.
  test.skip(
    info.project.name !== 'gate-ks-sq',
    'One canonical tenant run owns the uploaded employees.'
  );
  test.setTimeout(90_000);
  const locale = 'sq';
  await withSponsorFixture(async f => {
    await seedSubscription(f, f.paying, true);
    let sponsorId = '';
    let termId = '';
    await withFreshPage(browser, info, false, async page => {
      await loginPerson(page, info, f.agent, locale);
      await gotoApp(page, routePath(info, '/agent/sponsors'), info, {
        marker: 'agent-sponsors-page-ready',
      });
      const form = actionForm(page, locale, 'createSponsor');
      await form.locator('[name="leadId"]').selectOption(f.leadId);
      await form.locator('[name="legalName"]').fill(f.prefix);
      await form.locator('[name="billingContactName"]').fill('E2E billing contact');
      await form.locator('[name="billingContactEmail"]').fill(`${f.prefix}-billing@example.com`);
      await tabTo(page, form.getByRole('button'));
      await page.keyboard.press('Enter');
      await expect(form.getByRole('status')).toHaveText(copy(locale, 'sponsors', 'saved'));
      const company = await withTenantAuthority(f.authority, tx =>
        tx.query.sponsors.findFirst({ where: eq(sponsors.sourceLeadId, f.leadId) })
      );
      if (!company) throw new Error('UI did not create sponsor');
      sponsorId = company.id;
      await gotoApp(page, routePath(info, `/agent/sponsors/${sponsorId}`), info, {
        marker: 'agent-sponsors-detail-page-ready',
      });
      const termForm = actionForm(page, locale, 'createTerm');
      // datetime-local is browser-local. Derive strings in that browser's timezone.
      const localDate = (date: Date): Promise<string> =>
        page.evaluate(value => {
          const d = new Date(value);
          return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
        }, date.toISOString());
      await termForm.locator('[name="termStart"]').fill(await localDate(f.start));
      await termForm.locator('[name="termEnd"]').fill(await localDate(f.end));
      await termForm.locator('[name="planKey"]').selectOption(f.planKey);
      await termForm.locator('[name="legalEntityId"]').selectOption(f.entityId);
      await termForm.locator('[name="seatCount"]').fill('4');
      await termForm.locator('[name="pricePerSeatMinor"]').fill('15000');
      await termForm.locator('[name="contractReference"]').fill(f.prefix);
      await termForm.locator('[name="termsVersion"]').fill('e2e-v1');
      await termForm.getByRole('button').click();
      await expect(termForm.getByRole('status')).toHaveText(copy(locale, 'sponsors', 'saved'));
      const terms = await readTerms(f, sponsorId);
      expect(terms).toHaveLength(1);
      const term = terms[0];
      if (!term) throw new Error('UI did not create term');
      termId = term.id;
      const revisions = await withTenantAuthority(f.authority, tx =>
        tx.select().from(sponsorTermRevisions).where(eq(sponsorTermRevisions.termId, termId))
      );
      expect(revisions).toMatchObject([{ revision: 1, seatCount: 4, createdBy: f.agent.id }]);
      await gotoApp(page, routePath(info, `/agent/sponsors/${sponsorId}/terms/${termId}`), info, {
        marker: 'agent-sponsors-roster-page-ready',
      });
      await expect(actionForm(page, locale, 'decideRevision')).toHaveCount(0);
    });
    await withFreshPage(browser, info, false, async page => {
      await loginPerson(page, info, f.staff, locale);
      await gotoApp(page, routePath(info, `/staff/sponsors/${sponsorId}/terms/${termId}`), info, {
        marker: 'staff-sponsors-roster-page-ready',
      });
      const form = actionForm(page, locale, 'decideRevision');
      await form.locator('[name="decision"][value="approved"]').check();
      await form.locator('[name="invoiceReference"]').fill(f.prefix);
      await tabTo(page, form.getByRole('button'));
      await page.keyboard.press('Enter');
      await expect(actionForm(page, locale, 'uploadRoster')).toBeVisible();
    });
    await withFreshPage(browser, info, false, async page => {
      await loginPerson(page, info, f.agent, locale);
      const path = routePath(info, `/agent/sponsors/${sponsorId}/terms/${termId}`);
      await gotoApp(page, path, info, { marker: 'agent-sponsors-roster-page-ready' });
      const upload = actionForm(page, locale, 'uploadRoster');
      const rows = [
        ['New', f.newEmail],
        ['Existing', f.member.email],
        ['Paying', f.paying.email],
        ['Foreign', f.foreign.email],
      ];
      await upload.locator('input[type="file"]').setInputFiles({
        name: 'employees.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          [
            'firstName,lastName,email',
            ...rows.map(([name, email]) => `${name},Employee,${email}`),
          ].join('\n')
        ),
      });
      // The file input also has the button role; submit by the action's own name.
      await upload
        .getByRole('button', {
          name: copy(locale, 'sponsors', 'actions.uploadRoster'),
          exact: true,
        })
        .click();
      await expect(upload.getByRole('status')).toHaveText(
        copy(locale, 'sponsors', 'uploadSummary', {
          inserted: 4,
          invalid: 0,
          duplicates: 0,
          alreadyListed: 0,
        })
      );
      await provisionOwnedRoster(f);
      const entries = await withTenantAuthority(f.authority, tx =>
        tx.select().from(sponsorRosterEntries).where(eq(sponsorRosterEntries.termId, termId))
      );
      expect(entries.find(row => row.emailNormalized === f.foreign.email)).toMatchObject({
        outcome: 'foreign',
        userId: null,
      });
      expect(entries.find(row => row.emailNormalized === f.paying.email)).toMatchObject({
        userId: f.paying.id,
        outcome: 'awaiting_paid_end',
      });
      // A changed account email must never replace the address the company supplied.
      const privateEmail = `${f.prefix}-private@example.com`;
      await withTenantAuthority(f.authority, async tx => {
        await tx.update(user).set({ email: privateEmail }).where(eq(user.id, f.member.id));
        await tx.insert(claims).values({
          id: `${f.prefix}-private-claim`,
          tenantId: f.tenantId,
          userId: f.member.id,
          branchId: f.branchId,
          title: `${f.prefix}-private-title`,
          description: `${f.prefix}-private-description`,
          category: 'vehicle',
          companyName: 'Private insurer',
        });
      });
      await gotoApp(page, path, info, { marker: 'agent-sponsors-roster-page-ready' });
      const ready = visible(page.getByTestId('agent-sponsors-roster-page-ready'));
      await expect(ready).toContainText(
        copy(locale, 'sponsors', 'seatsUsed', { used: 4, seats: 4 })
      );
      await expect(ready).toContainText(`${copy(locale, 'sponsors', 'statuses.registered')}: 1`);
      await expect(ready).toContainText(
        `${copy(locale, 'sponsors', 'statuses.awaiting_employee')}: 3`
      );
      await expect(ready).toContainText(
        `${copy(locale, 'sponsors', 'statuses.left_programme')}: 0`
      );
      await expect(rosterRow(page, f.member.email)).toContainText(
        copy(locale, 'sponsors', 'statuses.registered')
      );
      await Promise.all(
        [f.newEmail, f.paying.email, f.foreign.email].map(email =>
          expect(rosterRow(page, email)).toContainText(
            copy(locale, 'sponsors', 'statuses.awaiting_employee')
          )
        )
      );
      await expect(ready).not.toContainText(privateEmail);
      await expect(ready).not.toContainText(`${f.prefix}-private-title`);
      await expect(ready).not.toContainText(`${f.prefix}-private-description`);
      await expect(ready).not.toContainText(`sub_${f.paying.id}`);
      await expect(ready.locator('a[href*="/claims"], a[href*="/payments"]')).toHaveCount(0);
    });
  });
});
