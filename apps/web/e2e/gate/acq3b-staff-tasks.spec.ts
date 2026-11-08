import { expect, test } from '../fixtures/auth.fixture';
import { path as routePath } from '../fixtures/routes';
import { gotoApp } from '../utils/navigation';
import { withFreshPage } from './test/login-handoff-page';
import { withSponsorFixture } from './acq3b-context.fixture';
import {
  seedEntry,
  seedHandover,
  seedSponsor,
  seedSubscription,
  seedTerm,
} from './acq3b-seed.fixture';
import { actionForm, copy, locales, loginPerson, tabTo, visible } from './acq3b-ui.fixture';

test.describe('ACQ-3b staff tasks and accessible sponsor pages', () => {
  for (const locale of locales) {
    test(`${locale}: task navigation, handover review and creator refusal`, async ({
      browser,
    }, info) => {
      test.skip(
        info.project.name !== 'gate-ks-sq',
        'Keep host-derived KS tenant while varying language.'
      );
      test.setTimeout(90_000);
      await withSponsorFixture(async f => {
        const sponsorId = await seedSponsor(f);
        const { termId } = await seedTerm(f, sponsorId);
        await seedSubscription(f, f.paying, true);
        const entryId = await seedEntry(f, termId, f.paying, null, 'awaiting_paid_end');
        const intentId = await seedHandover(f, entryId, true);
        const pending = await seedTerm(
          f,
          sponsorId,
          f.end,
          new Date(f.end.getTime() + 365 * 86_400_000),
          false,
          true
        );
        await withFreshPage(browser, info, false, async page => {
          await loginPerson(page, info, f.staff, locale);
          await gotoApp(page, routePath(info, `/${locale}/staff/sponsors`), info, {
            marker: 'staff-sponsors-page-ready',
          });
          await expect(visible(page.getByTestId('staff-sponsors-page-ready'))).toContainText(
            copy(locale, 'sponsors', 'title')
          );
          const tasks = visible(
            page.getByRole('link', {
              name: copy(locale, 'sponsorTasks', 'tasksLink'),
              exact: true,
            })
          );
          await tabTo(page, tasks);
          await page.keyboard.press('Enter');
          await expect(page).toHaveURL(routePath(info, `/${locale}/staff/sponsors/tasks`));
          const ready = visible(page.getByTestId('staff-sponsor-tasks-page-ready'));
          await expect(ready).toBeVisible();
          await expect(ready.getByRole('heading', { level: 1 })).toHaveText(
            copy(locale, 'sponsorTasks', 'title')
          );
          const task = ready.locator('li').filter({ hasText: intentId });
          await expect(task).toContainText(f.paying.id);
          await expect(task).toContainText(
            copy(locale, 'sponsorTasks', 'intent', { id: intentId })
          );
          await tabTo(
            page,
            task.getByRole('button', {
              name: copy(locale, 'sponsorTasks', 'actions.evidence'),
              exact: true,
            })
          );
          await gotoApp(page, routePath(info, `/${locale}/staff/sponsors/${sponsorId}`), info, {
            marker: 'staff-sponsors-detail-page-ready',
          });
          await expect(visible(page.getByTestId('staff-sponsors-detail-page-ready'))).toContainText(
            copy(locale, 'sponsors', 'terms')
          );
          await gotoApp(
            page,
            routePath(info, `/${locale}/staff/sponsors/${sponsorId}/terms/${pending.termId}`),
            info,
            { marker: 'staff-sponsors-roster-page-ready' }
          );
          await expect(visible(page.getByTestId('staff-sponsors-roster-page-ready'))).toContainText(
            copy(locale, 'sponsors', 'roster')
          );
          const decision = actionForm(page, locale, 'decideRevision');
          await expect(decision).toContainText(copy(locale, 'sponsors', 'creatorCannotDecide'));
          await expect(decision.getByRole('button')).toBeDisabled();
        });
        await withFreshPage(browser, info, false, async page => {
          await loginPerson(page, info, f.agent, locale);
          await gotoApp(page, routePath(info, `/${locale}/agent/sponsors`), info, {
            marker: 'agent-sponsors-page-ready',
          });
          await expect(visible(page.getByTestId('agent-sponsors-page-ready'))).toContainText(
            copy(locale, 'sponsors', 'title')
          );
          await gotoApp(page, routePath(info, `/${locale}/agent/sponsors/${sponsorId}`), info, {
            marker: 'agent-sponsors-detail-page-ready',
          });
          await expect(visible(page.getByTestId('agent-sponsors-detail-page-ready'))).toContainText(
            copy(locale, 'sponsors', 'terms')
          );
          await gotoApp(
            page,
            routePath(info, `/${locale}/agent/sponsors/${sponsorId}/terms/${termId}`),
            info,
            { marker: 'agent-sponsors-roster-page-ready' }
          );
          await expect(visible(page.getByTestId('agent-sponsors-roster-page-ready'))).toContainText(
            copy(locale, 'sponsors', 'roster')
          );
          // The upload form's file input also has the button role; target the named action.
          await tabTo(
            page,
            actionForm(page, locale, 'uploadRoster').getByRole('button', {
              name: copy(locale, 'sponsors', 'actions.uploadRoster'),
              exact: true,
            })
          );
        });
      });
    });
  }
});
