import { expect, test } from '../fixtures/auth.fixture';

test.describe('Claims Dashboard Visual Regression', () => {
  // 1. Standard Member View
  test('member views claims dashboard', async ({ page, loginAs }) => {
    // Login as member
    await loginAs('member');

    // Navigate to claims
    await page.goto('/dashboard/claims');

    // Wait for content to load
    await expect(page.getByRole('heading', { name: 'My Claims' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Take screenshot
    await expect(page).toHaveScreenshot('member-claims-dashboard.png', {
      fullPage: true,
      mask: [page.locator('[data-testid="user-nav-email"]')], // Mask dynamic user data if present
    });
  });

  // 2. Staff View
  test('staff views claims dashboard', async ({ page, loginAs }) => {
    // Login as staff
    await loginAs('staff');

    // Navigate to admin claims
    await page.goto('/admin/claims');

    // Wait for content to load
    await expect(page.getByRole('heading', { name: 'Claims Management' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Take screenshot
    await expect(page).toHaveScreenshot('staff-claims-dashboard.png', {
      fullPage: true,
      mask: [page.locator('[data-testid="user-nav-email"]')],
    });
  });
});
