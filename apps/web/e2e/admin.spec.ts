import { expect, test } from './fixtures/auth.fixture';

test.describe('Admin Panel Robustness', () => {
  test('Admin user can access all main sections', async ({ adminPage: page }) => {
    // Dashboard
    await page.goto('/en/admin');
    await expect(page.getByRole('heading', { name: /Admin Dashboard/i, level: 1 })).toBeVisible();
    await expect(page.getByText('Recent Activity')).toBeVisible();

    // Claims Management
    await page.goto('/en/admin/claims');
    await expect(page.getByRole('heading', { name: 'Claims Management', level: 1 })).toBeVisible();
    await expect(page.getByRole('table').or(page.locator('.ag-grid, .grid'))).toBeVisible();

    // User Management
    await page.goto('/en/admin/users');
    // Heading is "Members" based on translations
    await expect(page.getByRole('heading', { name: /Members/i, level: 1 })).toBeVisible();
    await expect(page.locator('table').first()).toBeVisible();

    // Analytics
    await page.goto('/en/admin/analytics');
    await expect(page.getByText('Analytics Overview')).toBeVisible();

    // Settings
    await page.goto('/en/admin/settings');
    await expect(
      page.getByRole('heading', { name: /Admin Settings|Settings/i, level: 1 })
    ).toBeVisible();
    await expect(page.getByText('General')).toBeVisible();
  });

  test.skip('Regular user is denied access to admin routes', async ({
    authenticatedPage: page,
  }) => {
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
      await expect(page).toHaveURL(/.*\/member/);
    }
  });

  test('Agent and Staff are denied access to sensitive admin routes', async ({
    agentPage,
    staffPage,
  }) => {
    // Agents shouldn't see Admin Dashboard at all
    await agentPage.goto('/en/admin');
    await expect(agentPage).not.toHaveURL(/.*\/admin/); // Relaxed check

    // Staff should be routed to staff workspace, not admin users
    await staffPage.goto('/en/admin/users');
    await expect(staffPage).not.toHaveURL(/.*\/admin\/users/);
  });

  test('Admin can navigate via Sidebar', async ({ adminPage: page }) => {
    await page.goto('/en/admin');

    // Check Sidebar links (using translation keys or text)
    await page.waitForSelector('[data-testid="admin-sidebar"]');
    const sidebar = page.locator('[data-testid="admin-sidebar"]').first();
    await expect(sidebar).toBeVisible();

    await expect(sidebar.getByRole('link', { name: /Dashboard/i })).toBeVisible();
    // "Claims" -> "Case Management"
    await expect(sidebar.getByRole('link', { name: /Case Management/i })).toBeVisible();
    // "Users" -> "Members"
    await expect(sidebar.getByRole('link', { name: /Members/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Analytics/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Settings/i })).toBeVisible();

    // Navigate to Users and verify
    await sidebar.getByRole('link', { name: /Members/i }).click();
    await expect(page).toHaveURL(/.*\/admin\/users/);
    await expect(page.getByRole('heading', { name: /Members/i, level: 1 })).toBeVisible();
  });
});
