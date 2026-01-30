import { expect, test } from '../fixtures/auth.fixture';

test.describe('@quarantine Claims Dashboard Visual Regression', () => {
  // TODO: Re-enable when visual snapshots are standardized in Docker
  // test.skip(true, 'Visual tests require consistent environment');
  test.beforeEach(({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      // Filter out standard React/Next.js dev noise
      if (
        text.includes('React DevTools') ||
        text.includes('[HMR]') ||
        text.includes('[Fast Refresh]')
      ) {
        return;
      }
      console.log(`[BROWSER]: ${text}`);
    });
  });

  // 1. Standard Member View
  test('member views claims dashboard', async ({ page, loginAs }) => {
    // Login as member
    await loginAs('member');

    // Navigate to claims
    await page.goto('/member/claims');

    // Wait for content to load
    await expect(page.getByTestId('page-title')).toBeVisible();
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

    // Navigate to staff claims
    await page.goto('/staff/claims');

    // Wait for content to load
    await expect(page.getByTestId('page-title')).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Take screenshot
    await expect(page).toHaveScreenshot('staff-claims-dashboard.png', {
      fullPage: true,
      mask: [page.locator('[data-testid="user-nav-email"]')],
    });
  });
});
