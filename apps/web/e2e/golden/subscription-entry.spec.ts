import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

/**
 * Subscription Entry (Golden Flow)
 *
 * Verifies the canonical public membership entry still presents plans while checkout is closed.
 */
test.describe('Golden Flow: Subscription Entry', () => {
  test('Logged out visitors can compare membership plans with checkout closed', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      let paddleRequests = 0;
      await page.route('https://cdn.paddle.com/**', async route => {
        paddleRequests += 1;
        await route.abort();
      });
      await gotoApp(page, routes.publicMembershipEntry(testInfo), testInfo, {
        marker: 'pricing-page-ready',
      });
      await page.waitForLoadState('load');

      await expect(page.getByTestId('plan-card-standard').getByText('€20')).toBeVisible();
      await expect(page.getByTestId('plan-card-family').getByText('€35')).toBeVisible();
      await expect(page.getByTestId('pricing-checkout-closed')).toBeVisible();
      await expect(page.getByTestId(/^plan-cta-/)).toHaveCount(0);
      await expect(page.getByTestId('pricing-precheckout-confirmation')).toHaveCount(0);
      await expect(page.getByTestId('precheckout-continue-cta')).toHaveCount(0);
      await expect(page.getByTestId(/^pricing-otp-/)).toHaveCount(0);
      await expect(page.locator('script[src*="paddle.com"]')).toHaveCount(0);
      expect(paddleRequests).toBe(0);
    });
  });
});
