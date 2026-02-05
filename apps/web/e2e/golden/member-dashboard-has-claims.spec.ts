import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Member Dashboard (Has Claims)', () => {
  test('Member with claims sees v3 surface without legacy claims list', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'dashboard-page-ready' });

    await expect(page.getByTestId('dashboard-page-ready')).toBeVisible();
    await expect(page.getByTestId('portal-surface-indicator')).toContainText(/Portal: Member/i);
    await expect(page.getByTestId('portal-surface-indicator')).toContainText(/Surface: v3/i);
    await expect(page.getByTestId('dashboard-heading')).toBeVisible();
    await expect(page.getByTestId('member-header')).toBeVisible();
    await expect(page.getByTestId('member-primary-actions')).toBeVisible();
    await expect(page.getByTestId('member-claims-list')).toHaveCount(0);
    await expect(page.getByTestId('member-support-link')).toBeVisible();
    await expect(page.getByTestId('member-active-claim')).toBeVisible();

    const cta = page.getByTestId('member-primary-actions').getByTestId('member-start-claim-cta');
    await expect(cta).toHaveAttribute('href', new RegExp(`${routes.memberNewClaim(testInfo)}$`));
  });
});
