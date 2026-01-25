import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

/**
 * STRICT E2E SPEC TEMPLATE
 *
 * Use this template for all new E2E specifications.
 *
 * CORE RULES:
 * 1. NO raw `page.goto()`. Use `gotoApp` with explicit readiness marker.
 * 2. NO text-based selectors for critical actions. Use `data-testid`.
 * 3. NO locale-specific hacks. Use `testInfo` for locale-aware routing.
 * 4. ISOLATION: Use `authenticatedPage` fixture for logged-in state.
 */

test.describe.skip('TEMPLATE: Feature Name', () => {
  test('should perform critical user action', async ({ authenticatedPage: page }, testInfo) => {
    // -----------------------------------------------------------------------
    // 1. Navigation (Rule #1 & #5)
    // -----------------------------------------------------------------------
    // - pass `testInfo` to both routes helper and gotoApp
    // - specify an explicit `marker` (data-testid) that confirms page is ready
    await gotoApp(page, routes.memberNewClaim(testInfo), testInfo, {
      marker: 'new-claim-page-ready',
    });

    // -----------------------------------------------------------------------
    // 2. Interaction (Rule #2)
    // -----------------------------------------------------------------------
    // - Use `getByTestId` for stability. Avoid `getByText` or label unless testing copy.
    await page.getByTestId('category-vehicle').click();
    await page.getByTestId('wizard-next').click();

    // -----------------------------------------------------------------------
    // 3. Form Filling
    // -----------------------------------------------------------------------
    // - Use specific testids for inputs to avoid ambiguity
    await page.getByTestId('input-title').fill('Test Claim');

    // -----------------------------------------------------------------------
    // 4. Submission & Verification
    // -----------------------------------------------------------------------
    const submitButton = page.getByTestId('wizard-submit');
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // - Wait for the *destination* marker after redirection
    await expect(page.getByTestId('claims-page-ready')).toBeVisible();
  });

  test('should handle public pages', async ({ page }, testInfo) => {
    // Use standard `page` fixture for unauthenticated access
    await gotoApp(page, routes.pricing(testInfo), testInfo, { marker: 'pricing-page-ready' });

    // Use strict assertions
    await expect(page.getByTestId('plan-card-standard')).toBeVisible();
  });
});
