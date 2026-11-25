import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { withAnonymousPage } from '../utils/anonymous-context';
import { gotoApp } from '../utils/navigation';

test.describe('Subscription closure contract', () => {
  test('Pricing still displays plan information with checkout closed', async ({
    page,
  }, testInfo) => {
    await gotoApp(page, routes.pricing(testInfo), testInfo, { marker: 'pricing-page-ready' });

    await expect(page.getByTestId('plan-card-standard')).toBeVisible();
    await expect(page.getByTestId('pricing-checkout-closed')).toBeVisible();
    await expect(page.getByTestId(/^plan-cta-/)).toHaveCount(0);
  });

  test('A logged-out pricing deep link cannot start checkout or email verification', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      await gotoApp(page, `${routes.pricing(testInfo)}?plan=standard`, testInfo, {
        marker: 'pricing-page-ready',
      });

      await expect(page.getByTestId('pricing-checkout-closed')).toBeVisible();
      await expect(page.getByTestId(/^plan-cta-/)).toHaveCount(0);
      await expect(page.getByTestId('pricing-precheckout-confirmation')).toHaveCount(0);
      await expect(page.getByTestId('pricing-otp-step')).toHaveCount(0);
    });
  });

  test('A signed-in member cannot start checkout even with billing test mode enabled', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.pricing(testInfo), testInfo, { marker: 'pricing-page-ready' });

    await expect(page.getByTestId('pricing-page')).toHaveAttribute('data-billing-test-mode', '1');
    await expect(page.getByTestId('pricing-checkout-closed')).toBeVisible();
    await expect(page.getByTestId(/^plan-cta-/)).toHaveCount(0);
    await expect(page.getByTestId('pricing-precheckout-confirmation')).toHaveCount(0);
    await expect(page.getByTestId('pricing-otp-step')).toHaveCount(0);
    await expect(page).not.toHaveURL(/membership\/success/);
  });
});
