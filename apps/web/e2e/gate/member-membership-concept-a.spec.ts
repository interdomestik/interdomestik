import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { copy, type Locale, visible } from './acq3b-ui.fixture';

// Replaces golden/member-plan-ops.spec.ts (WP-18 slice 3): the seeded member's plan is visible with
// its status and period and offers its actions, on the concept A screen. Nothing here mutates data.
test.describe('Member membership screen on concept A', () => {
  test('shows the plan, its status, period and actions, and recovers a stale selection link', async ({
    authenticatedPage: page,
  }, info) => {
    const locale = routes.getLocale(info) as Locale;
    const text = (key: string) => copy(locale, 'membership', key);
    const path = routes.memberMembership(info);

    await gotoApp(page, path, info, { marker: 'membership-page-ready' });
    const screen = visible(page.getByTestId('membership-page-ready'));
    await expect(screen.getByRole('heading', { level: 1, name: text('page.title') })).toBeVisible();

    const status = visible(page.getByTestId('membership-status-region'));
    await expect(status.getByRole('heading', { level: 2 })).toHaveText(/Golden Basic/);
    await expect(status.getByText(text('plan.status_label'), { exact: true })).toBeVisible();
    await expect(visible(page.getByTestId('membership-current-period-end'))).toHaveText(/\d{4}/);
    // The seeded plan is active and offers its payment update; nothing here clicks it.
    await expect(status.getByTestId('ops-status-badge')).toHaveText(
      copy(locale, 'common', 'membershipStatus.active')
    );
    const actions = visible(page.getByTestId('membership-actions'));
    await expect(
      actions.getByRole('button', { name: text('dunning.update_payment_button'), exact: true })
    ).toBeEnabled();
    await expect(page.getByTestId('ops-table')).toHaveCount(0);
    // The history and documents the old ops detail showed stay on the screen.
    await expect(visible(page.getByTestId('ops-timeline'))).toBeVisible();
    await expect(visible(page.getByTestId('ops-documents-panel'))).toBeVisible();

    const about = visible(page.getByRole('region', { name: text('ops.about_title') }));
    await expect(about.getByTestId('membership-coverage-matrix')).toBeVisible();

    await gotoApp(page, `${path}?selected=not-a-current-record`, info, {
      marker: 'membership-page-ready',
    });
    const stale = visible(page.getByTestId('membership-selection-unavailable'));
    await expect(stale.getByRole('alert')).toHaveText(text('ops.selection_unavailable'));
    await expect(page.getByTestId('membership-status-region')).toHaveCount(0);
    await stale.getByRole('button', { name: text('ops.open_current') }).click();
    await expect(page).not.toHaveURL(/selected=/);
    await expect(visible(page.getByTestId('membership-status-region'))).toBeVisible();
  });
});
