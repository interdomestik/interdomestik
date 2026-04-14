import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

/**
 * Subscription Entry (Golden Flow)
 *
 * Verifies: canonical public membership entry -> plan confirmation -> OTP step
 */
test.describe('Golden Flow: Subscription Entry', () => {
  test('Logged out user can start standard membership through pricing OTP onboarding', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      await gotoApp(page, routes.publicMembershipEntry(testInfo), testInfo, {
        marker: 'pricing-page-ready',
      });

      await page.getByTestId('plan-cta-standard').click();
      await expect(page.getByTestId('pricing-precheckout-confirmation')).toBeVisible();
      await page.getByTestId('precheckout-continue-cta').click();
      await expect(page.getByTestId('pricing-otp-step')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('pricing-otp-email-input')).toBeVisible();
      await expect(page.getByTestId('pricing-otp-code-input')).toBeVisible();
    });
  });
});
