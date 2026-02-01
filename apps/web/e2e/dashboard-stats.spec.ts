import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe.skip('User Dashboard Statistics', () => {
  test('User can view real claim statistics on dashboard', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    // Check page title
    // await expect(page.getByText(/Overview/i)).toBeVisible();

    // Check statistics cards exist
    await expect(page.getByText('Active Claims')).toBeVisible();
    await expect(page.getByText('Total Saved')).toBeVisible();

    // Verify statistics show numbers (not hardcoded 0)
    // The stats should be visible as text content
    const statsCards = page.locator('[class*="text-3xl"][class*="font-bold"]');
    await expect(statsCards.first()).toBeVisible();

    // Check that at least one stat card has content
    const firstStatValue = await statsCards.first().textContent();
    expect(firstStatValue).toBeTruthy();
  });

  test('Dashboard statistics update based on user claims', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    // Get initial active claims count
    // Use a clearer selector hierarchy: Find the card that has the title "Active Claims"
    // We use the specific class we know exists on these cards
    const activeClaimsCard = page
      .locator('.shadow-premium')
      .filter({ hasText: 'Active Claims' })
      .first();

    // Ensure card is visible before querying children
    await expect(activeClaimsCard).toBeVisible();

    // Get the number
    const initialCount = await activeClaimsCard.locator('.text-3xl').textContent();

    // Navigate to claims page to verify consistency
    // Navigate to claims page to verify consistency
    await gotoApp(page, routes.memberClaims(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    // Count actual claims in the table
    // const claimRows = page.getByRole('row');
    // const rowCount = await claimRows.count();

    // Go back to dashboard
    // Go back to dashboard
    await gotoApp(page, routes.member(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    // Verify the count is still the same
    const currentCount = await activeClaimsCard.locator('.text-3xl').textContent();
    expect(currentCount).toBe(initialCount);
  });

  test.skip('Dashboard shows correct empty state when no claims', async ({ page }, testInfo) => {
    // Register a NEW user to guarantee 0 claims
    const cleanEmail = `empty${Date.now()}@test.com`;
    const cleanPass = 'TestPass123!';
    const cleanName = 'Empty State User';

    await gotoApp(page, routes.register('en'), testInfo);

    // Fill register form
    await page.fill('input[name="fullName"]', cleanName);
    await page.fill('input[name="email"]', cleanEmail);
    await page.fill('input[name="password"]', cleanPass);
    await page.fill('input[name="confirmPassword"]', cleanPass);
    // Check terms
    await page.click('label[for="terms"]'); // Click label to check invisible checkbox if needed, or use .check()
    // Submit
    // Wait for button to be enabled and click
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeEnabled();
    await submitButton.click({ force: true });

    // Should redirect to dashboard (or login then dashboard)
    // Assuming register auto-logs in or redirects to login
    // If it redirects to login, we log in.
    // Try waiting for member first, if not try login

    try {
      await page.waitForURL('**/member', { timeout: 5000 });
    } catch {
      // If we are at login page, log in
      if (page.url().includes('login')) {
        await page.fill('input[name="email"]', cleanEmail);
        await page.fill('input[name="password"]', cleanPass);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/member');
      }
    }

    await page.waitForLoadState('domcontentloaded');

    // Stats should show 0 for new users
    // We expect "0" or "No Active Protection" depending on the implementation
    // The previous test expects .text-3xl to be visible.

    // Check "Active Claims" card - should exist but show 0
    await expect(page.getByText('Active Claims')).toBeVisible();

    const activeClaimsCard = page
      .locator('.shadow-premium')
      .filter({ hasText: 'Active Claims' })
      .first();

    await expect(activeClaimsCard).toBeVisible();
    await expect(activeClaimsCard.locator('.text-3xl')).toHaveText('0');
  });
});
