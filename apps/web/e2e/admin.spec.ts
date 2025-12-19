import { expect, test } from './fixtures/auth.fixture';

test.describe('Admin Panel Robustness', () => {
  test('Admin user can access all main sections', async ({ adminPage: page }) => {
    // Dashboard
    await page.goto('/en/admin');
    await expect(page.getByRole('heading', { name: /Admin Dashboard/i })).toBeVisible();
    await expect(page.getByText('Recent Activity')).toBeVisible();

    // Claims Management
    await page.goto('/en/admin/claims');
    await expect(page.getByRole('heading', { name: 'Claims Management' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    // User Management
    await page.goto('/en/admin/users');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    // Analytics
    await page.goto('/en/admin/analytics');
    await expect(page.getByRole('heading', { name: 'Analytics Overview' })).toBeVisible();
    await expect(page.getByText('Total Claim Value')).toBeVisible();

    // Settings
    await page.goto('/en/admin/settings');
    await expect(page.getByRole('heading', { name: 'Admin Settings' })).toBeVisible();
    await expect(page.getByText('General')).toBeVisible();
  });

  test('Regular user is denied access to admin routes', async ({ authenticatedPage: page }) => {
    const adminRoutes = [
      '/en/admin',
      '/en/admin/claims',
      '/en/admin/users',
      '/en/admin/analytics',
      '/en/admin/settings',
    ];

    for (const route of adminRoutes) {
      await page.goto(route);
      // Middleware should redirect non-admins
      await expect(page).toHaveURL(/.*\/dashboard/);
    }
  });

  test('Admin can navigate via Sidebar', async ({ adminPage: page }) => {
    await page.goto('/en/admin');

    // Check Sidebar links (using translation keys or text)
    const sidebar = page.locator('nav');
    await expect(sidebar.getByRole('link', { name: /Dashboard/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Claims/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Users/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Analytics/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Settings/i })).toBeVisible();

    // Navigate to Users and verify
    await sidebar.getByRole('link', { name: /Users/i }).click();
    await expect(page).toHaveURL(/.*\/admin\/users/);
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
  });
});
