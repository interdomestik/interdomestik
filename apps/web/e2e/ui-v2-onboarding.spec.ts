import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('UI_V2 Member Onboarding', () => {
  test('renders locked UI_V2 member sections', async ({ authenticatedPage: page }, testInfo) => {
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

    await expect(page.locator('[data-ui-v2="true"]')).toBeVisible();
    await expect(page.getByTestId('member-hero')).toBeVisible();
    await expect(page.getByTestId('member-benefits')).toBeVisible();
    await expect(page.getByTestId('member-quick-actions')).toBeVisible();
    await expect(page.getByTestId('member-how-it-works')).toBeVisible();
    await expect(page.getByTestId('member-claims-module')).toBeVisible();
    await expect(page.getByTestId('member-center')).toBeVisible();
    await expect(page.getByTestId('member-trust-footer')).toBeVisible();
    await expect(page.getByTestId('cta-get-help-now')).toBeVisible();
  });

  test('member can reach claims wizard from UI_V2 and see wizard controls', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

    await expect(page.locator('[data-ui-v2="true"]')).toBeVisible();

    await page.getByTestId('cta-start-claim').click();
    await expect(page).toHaveURL(/\/member\/claims\/new/);
    await expect(page.getByTestId('wizard-next')).toBeVisible();
  });
});
