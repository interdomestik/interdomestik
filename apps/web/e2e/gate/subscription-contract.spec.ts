import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Subscription Contract Verification', () => {
  test('Pricing page loads and displays plans', async ({ page }, testInfo) => {
    // 1. Navigate to pricing
    await gotoApp(page, routes.pricing(testInfo), testInfo, { marker: 'pricing-page-ready' });

    // 2. Verify standard plan card exists
    await expect(page.getByTestId('plan-card-standard')).toBeVisible();
    await expect(page.getByTestId('plan-cta-standard')).toBeVisible();
  });

  test('Logged out Join Now redirects to register', async ({ browser }, testInfo) => {
    // Use a fresh context without storageState
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    // Use route builder to ensure full absolute URL with port is used
    await gotoApp(page, routes.pricing(testInfo), testInfo, { marker: 'pricing-page-ready' });

    // Small wait for hydration to ensure Link is active
    await page.waitForTimeout(1000);

    // Click standard plan CTA - use getByTestId for resilience
    const cta = page.getByTestId('plan-cta-standard');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', /.*register.*/);
    await cta.scrollIntoViewIfNeeded();

    await Promise.all([
      page.waitForURL(/.*\/register\?plan=standard/, { timeout: 15000 }),
      cta.click(),
    ]);

    await expect(page.getByTestId('registration-page-ready')).toBeVisible({ timeout: 15000 });

    await context.close();
  });

  test('Logged in Join Now triggers checkout (Contract only)', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.pricing(testInfo), testInfo, { marker: 'pricing-page-ready' });

    // Mock Paddle global to catch the call
    await page.addInitScript(() => {
      (window as any).Paddle = {
        Initialize: () => {},
        Checkout: {
          open: (args: any) => {
            (window as any).__paddle_args = args;
          },
        },
      };
    });

    // Click CTA
    await page.getByTestId('plan-cta-standard').click();

    // In Billing Test Mode, it should redirect to success
    if (process.env.NEXT_PUBLIC_BILLING_TEST_MODE === '1') {
      await expect(page).toHaveURL(/.*\/member\/membership\/success\?test=true/, {
        timeout: 15000,
      });
    }
  });
});
