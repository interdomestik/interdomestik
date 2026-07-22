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
    const cookieBanner = page.getByTestId('cookie-consent-banner');
    if (await cookieBanner.isVisible().catch(() => false)) {
      await page.getByTestId('cookie-consent-accept').click();
      await expect(cookieBanner).toHaveCount(0);
    }

    // -----------------------------------------------------------------------
    // 2. Interaction (Rule #2)
    // -----------------------------------------------------------------------
    // - Use `getByTestId` for stability. Avoid `getByText` or label unless testing copy.
    const intake = page.locator('[data-testid="claim-draft-intake"]:visible').first();
    await intake.getByTestId('claim-draft-category-vehicle').click();
    await intake.getByTestId('claim-draft-category-continue').click();

    // -----------------------------------------------------------------------
    // 3. Form Filling
    // -----------------------------------------------------------------------
    // - Use specific testids for inputs to avoid ambiguity
    const panel = intake.getByTestId('claim-draft-main-panel');
    await panel.locator('select').nth(0).selectOption('collision');
    await panel.locator('input[type="date"]').fill('2026-07-21');
    await panel.locator('input[type="text"]').fill('Example counterparty');
    await panel.locator('select').nth(1).selectOption('repair');
    await panel.locator('textarea').fill('Example preparation-only claim facts.');
    await panel.locator('button').last().click();

    // -----------------------------------------------------------------------
    // 4. Submission & Verification
    // -----------------------------------------------------------------------
    await expect(intake.getByTestId('claim-draft-dormant-preview')).toBeVisible();
    const submitButton = intake.getByTestId('claim-draft-submit-disabled');
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toHaveAttribute(
      'aria-describedby',
      'claim-draft-submit-explanation'
    );
    await submitButton.evaluate(element => (element as HTMLButtonElement).click());
    await expect(page.getByTestId('claim-created-success')).toHaveCount(0);
    await expect(page).toHaveURL(/\/member\/claims\/new/);
  });

  test('should handle public pages', async ({ page }, testInfo) => {
    // Use standard `page` fixture for unauthenticated access
    await gotoApp(page, routes.pricing(testInfo), testInfo, { marker: 'pricing-page-ready' });

    // Use strict assertions
    await expect(page.getByTestId('plan-card-standard')).toBeVisible();
  });
});
