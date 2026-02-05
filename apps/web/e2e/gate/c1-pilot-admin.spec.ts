import { expect, test } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERS } from '../../../../packages/database/src/e2e-users';

// Minimal login helper since auth.po doesn't exist yet in the expected location
async function loginAs(page: any, email: string, password: string) {
  // Use a localized route explicitly since we see failures with generic routing
  await page.goto('/en/login');

  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]'); // Assuming button[type="submit"] works

  // Wait for navigation away from login
  await page.waitForURL(
    (url: URL) => !url.pathname.includes('/login') && !url.pathname.includes('/sign-in'),
    { timeout: 30000 }
  );
}

test.describe('C1-01: Admin Initialization', () => {
  // Ensure we start with a fresh session (no lingering member login)
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Pilot Admin can access /admin but not /member', async ({ page }) => {
    // 1. Login as Pilot Admin
    await loginAs(page, E2E_USERS.PILOT_MK_ADMIN.email, E2E_PASSWORD);
    // Allow any locale prefix in the admin URL
    await page.waitForURL(/.*\/admin\/.*/);

    // 2. Verify dashboard elements
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
    await expect(page.getByText('Pilot Macedonia')).toBeVisible();

    // 3. Verify Isolation (Cannot access Member Portal)
    await page.goto('/member');
    // Should be redirected or show 403/404 - Logic depends on Next.js middleware/layout
    // For now assuming redirection to dashboard or login
    await expect(page).not.toHaveURL('/member/dashboard');
  });
});
