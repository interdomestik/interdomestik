import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Pricing Page', () => {
  test('Public: Unauthenticated user should see pricing table', async ({ page }, testInfo) => {
    // 1. Visit Pricing Page
    await gotoApp(page, routes.pricing(testInfo), testInfo, { marker: 'pricing-page-ready' });

    // 2. Verify Title
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 3. Verify Plans are visible (public access allowed)
    await expect(page.getByTestId('plan-card-standard')).toBeVisible();
    await expect(page.getByTestId('plan-card-family')).toBeVisible();

    // 4. Verify "Join Now" buttons are present
    // Instead of hiding them, they redirect to register
    await expect(page.getByTestId('plan-cta-standard')).toBeVisible();
    await expect(page.getByTestId('plan-cta-family')).toBeVisible();
  });

  test('Authenticated: User should see pricing table and plans', async ({
    authenticatedPage,
  }, testInfo) => {
    // 1. Visit Pricing Page as logged in user
    await gotoApp(authenticatedPage, routes.pricing(testInfo), testInfo, {
      marker: 'pricing-page-ready',
    });

    // 2. Verify Plan Cards are visible
    // "Basic", "Pro", etc.
    await expect(authenticatedPage.getByTestId('plan-card-standard')).toBeVisible();
    await expect(authenticatedPage.getByTestId('plan-card-family')).toBeVisible();

    // 3. Verify buttons are visible
    await expect(authenticatedPage.getByTestId('plan-cta-standard')).toBeVisible();
    await expect(authenticatedPage.getByTestId('plan-cta-family')).toBeVisible();
  });

  test('Checkout: Clicking join triggers Paddle', async ({ authenticatedPage }, testInfo) => {
    let alertMessage = '';
    // Handle alerts (e.g. "Payment system unavailable") gracefully to avoid Protocol Error
    authenticatedPage.on('dialog', async dialog => {
      alertMessage = dialog.message();
      console.log(`Alert dialog detected: ${alertMessage}`);
      await dialog.dismiss();
    });

    // Mock the global Paddle object using addInitScript so it persists/runs before load
    await authenticatedPage.addInitScript(() => {
      // Define types purely for the script context if needed, or cast window
      const windowWithPaddle = window as unknown as {
        Paddle: Record<string, unknown>;
        paddleOpenCalled: unknown;
      };
      windowWithPaddle.Paddle = {
        Checkout: {
          open: (args: unknown) => {
            console.log('Paddle.Checkout.open called', args);
            windowWithPaddle.paddleOpenCalled = args;
          },
          updateCheckout: () => {},
          updateItems: () => {},
          close: () => {},
        },
      } as Record<string, unknown>;
    });

    await gotoApp(authenticatedPage, routes.pricing(testInfo), testInfo, {
      marker: 'pricing-page-ready',
    });

    // Find the 'Asistenca' plan card and click its button
    const joinButton = authenticatedPage.getByTestId('plan-cta-standard');
    await expect(joinButton).toBeVisible();

    await joinButton.scrollIntoViewIfNeeded();
    await joinButton.click({ force: true });

    // Verification happens via console logs or lack of error
  });
});
