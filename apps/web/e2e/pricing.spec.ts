import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

test.describe('Pricing Page', () => {
  test('Public: visitors can see the plans and the closed notice', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      await gotoApp(page, routes.pricing('en'), testInfo, { marker: 'pricing-page-ready' });

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Asistenca', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Asistenca+', exact: true })).toBeVisible();
      await expect(page.getByTestId('pricing-checkout-closed')).toBeVisible();
      await expect(page.getByTestId(/^plan-cta-/)).toHaveCount(0);
    });
  });

  test('Authenticated: members can see plans without upgrade controls', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.pricing('en'), testInfo, { marker: 'pricing-page-ready' });

    await expect(page.getByTestId('plan-card-standard')).toBeVisible();
    await expect(page.getByTestId('plan-card-family')).toBeVisible();
    await expect(page.getByTestId('pricing-checkout-closed')).toBeVisible();
    await expect(page.getByTestId(/^plan-cta-/)).toHaveCount(0);
  });

  test('A plan deep link leaves checkout closed without loading Paddle.js', async ({
    authenticatedPage: page,
  }, testInfo) => {
    let providerScriptRequests = 0;
    await page.route('https://cdn.paddle.com/**', async route => {
      providerScriptRequests += 1;
      await route.abort();
    });
    await gotoApp(page, `${routes.pricing('en')}?plan=standard`, testInfo, {
      marker: 'pricing-page-ready',
    });
    await page.waitForLoadState('load');

    await expect(page.getByTestId('pricing-checkout-closed')).toBeVisible();
    await expect(page.getByTestId('pricing-precheckout-confirmation')).toHaveCount(0);
    await expect(page.getByTestId('pricing-otp-step')).toHaveCount(0);
    await expect(page.locator('script[src*="paddle.com"]')).toHaveCount(0);
    expect(providerScriptRequests).toBe(0);
  });
});
