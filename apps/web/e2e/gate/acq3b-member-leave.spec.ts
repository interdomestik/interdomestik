import { expect, test } from '../fixtures/auth.fixture';
import { path as routePath } from '../fixtures/routes';
import { gotoApp } from '../utils/navigation';
import { withFreshPage } from './test/login-handoff-page';
import { withSponsorFixture } from './acq3b-context.fixture';
import {
  readEntry,
  seedEntry,
  seedHandover,
  seedSponsor,
  seedSubscription,
  seedTerm,
} from './acq3b-seed.fixture';
import { copy, locales, loginPerson, rosterRow, tabTo, visible } from './acq3b-ui.fixture';
import { formatPilotDate } from '../../src/lib/utils/date';

test.describe('ACQ-3b member membership and leave', () => {
  for (const locale of locales) {
    test(`${locale}: sponsored facts, paid period and keyboard leave`, async ({
      browser,
    }, info) => {
      test.skip(
        info.project.name !== 'gate-ks-sq',
        'One tenant host; language is varied explicitly.'
      );
      test.setTimeout(90_000);
      await withSponsorFixture(async f => {
        const sponsorId = await seedSponsor(f);
        const { termId } = await seedTerm(f, sponsorId);
        const entryId = await seedEntry(f, termId, f.member);
        await seedSubscription(f, f.member);
        await seedSubscription(f, f.paying, true);
        const payingEntry = await seedEntry(f, termId, f.paying, null, 'awaiting_paid_end');
        await seedHandover(f, payingEntry);
        await withFreshPage(browser, info, false, async page => {
          await loginPerson(page, info, f.paying, locale);
          await gotoApp(page, routePath(info, `/${locale}/member/membership`), info, {
            marker: 'membership-page-ready',
          });
          await expect(visible(page.getByTestId('membership-current-period-end'))).toHaveText(
            formatPilotDate(f.paidEnd, locale, '')
          );
          await expect(visible(page.getByTestId('membership-sponsor-coverage'))).toHaveCount(0);
          await gotoApp(page, routePath(info, `/${locale}/pricing`), info, {
            marker: 'pricing-page-ready',
          });
          const date = formatPilotDate(f.paidEnd, locale, '');
          await expect(visible(page.getByTestId('pricing-sponsor-notice'))).toHaveText(
            copy(locale, 'pricing', 'sponsorNotice.startsOn', { date })
          );
        });
        await withFreshPage(browser, info, false, async page => {
          await loginPerson(page, info, f.member, locale);
          await gotoApp(page, routePath(info, `/${locale}/member/membership`), info, {
            marker: 'membership-page-ready',
          });
          await expect(visible(page.getByTestId('membership-entity-disclosure'))).toContainText(
            f.entityName
          );
          await expect(visible(page.getByTestId('membership-sponsor-coverage'))).toHaveText(
            copy(locale, 'membership', 'sponsorCoverage.covered_until', {
              date: formatPilotDate(f.end, locale, ''),
            })
          );
          await expect(visible(page.getByTestId('membership-current-period-end'))).toHaveText(
            `${formatPilotDate(f.start, locale, '')} – ${formatPilotDate(f.end, locale, '')}`
          );
          // Product currently lacks the requested leave-company-programme test ID.
          const leave = visible(
            page.getByRole('button', {
              name: copy(locale, 'membership', 'sponsorCoverage.leave'),
              exact: true,
            })
          );
          await tabTo(page, leave);
          await page.keyboard.press('Enter');
          const dialog = visible(page.getByRole('dialog'));
          await expect(dialog).toBeVisible();
          await tabTo(
            page,
            dialog.getByRole('button', {
              name: copy(locale, 'membership', 'sponsorCoverage.confirm'),
              exact: true,
            })
          );
          await page.keyboard.press('Enter');
          await expect(dialog).toHaveCount(0);
          await expect.poll(async () => (await readEntry(f, entryId)).revokedReason).toBe('left');
        });
        await withFreshPage(browser, info, false, async page => {
          await loginPerson(page, info, f.agent, locale);
          await gotoApp(
            page,
            routePath(info, `/${locale}/agent/sponsors/${sponsorId}/terms/${termId}`),
            info,
            { marker: 'agent-sponsors-roster-page-ready' }
          );
          await expect(rosterRow(page, f.member.email)).toContainText(
            copy(locale, 'sponsors', 'statuses.left_programme')
          );
        });
      });
    });
  }
});
