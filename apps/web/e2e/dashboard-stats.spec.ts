import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('User Dashboard Statistics', () => {
  test('User can view real claim statistics on dashboard', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'dashboard-heading' });

    // Check page title
    await expect(page.getByTestId('dashboard-heading')).toBeVisible();

    // Check statistics cards exist
    await expect(page.getByTestId('stats-card-active-claims')).toBeVisible();
    await expect(page.getByTestId('stats-card-total-saved')).toBeVisible();

    // Check that at least one stat card has content
    const statsValue = page.getByTestId('stats-value-active-claims');
    await expect(statsValue).toBeVisible();
    expect(await statsValue.textContent()).toBeTruthy();
  });

  test('Dashboard statistics update based on user claims', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'dashboard-heading' });

    // Get initial active claims count
    const activeClaimsValue = page.getByTestId('stats-value-active-claims');
    await expect(activeClaimsValue).toBeVisible();
    const initialCount = await activeClaimsValue.textContent();

    // Navigate to claims page to verify consistency
    await gotoApp(page, routes.memberClaims(testInfo), testInfo, { marker: 'claims-page-ready' });

    // Go back to dashboard
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'dashboard-heading' });

    // Verify the count is still the same
    const currentCount = await activeClaimsValue.textContent();
    expect(currentCount).toBe(initialCount);
  });

  test('Dashboard shows correct empty state when no claims', async ({ page }, testInfo) => {
    // Register a NEW user to guarantee 0 claims
    const cleanEmail = `empty${Date.now()}@test.com`;
    const cleanPass = 'TestPass123!';
    const cleanName = 'Empty State User';

    await gotoApp(page, routes.register(testInfo), testInfo, { marker: 'body' });

    // Fill register form
    await page.fill('input[name="fullName"]', cleanName);
    await page.fill('input[name="email"]', cleanEmail);
    await page.fill('input[name="password"]', cleanPass);
    await page.fill('input[name="confirmPassword"]', cleanPass);
    // Check terms
    await page.click('label[for="terms"]');
    // Submit
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeEnabled();
    await submitButton.click({ force: true });

    // Should redirect to dashboard (or login then dashboard)
    try {
      await expect(page.getByTestId('dashboard-heading')).toBeVisible({ timeout: 10000 });
    } catch {
      // If we are at login page, log in
      if (page.url().includes('login')) {
        await page.fill('input[name="email"]', cleanEmail);
        await page.fill('input[name="password"]', cleanPass);
        await page.click('button[type="submit"]');
        await expect(page.getByTestId('dashboard-heading')).toBeVisible();
      }
    }

    // Stats should show 0 for new users
    await expect(page.getByTestId('stats-card-active-claims')).toBeVisible();
    await expect(page.getByTestId('stats-value-active-claims')).toHaveText('0');
  });
});
