import { expect, test } from './fixtures/auth.fixture';

test.describe('Admin Panel', () => {
  // Use the admin fixture from auth.fixture.ts if available, otherwise login manual
  // Assuming 'admin' fixture logs in with role: admin
  test('Admin user can access dashboard and view stats', async ({ adminPage: page }) => {
    await page.goto('/en/admin');

    // Check Header and Sidebar
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin Panel' })).toBeVisible();

    // Check Stats Cards (text from translation keys 'agent.*')
    // We used t('stats.total') -> "Total Claims" likely?
    // Let's check for generic presence of stat cards
    await expect(page.locator('.grid > div').first()).toBeVisible();
  });

  test('Admin can view claims list', async ({ adminPage: page }) => {
    await page.goto('/en/admin/claims');
    await expect(page.getByRole('heading', { name: 'Claims Management' })).toBeVisible();

    // Check table headers
    await expect(page.getByRole('columnheader', { name: 'Title' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
  });

  test('Regular user cannot access admin panel', async ({ authenticatedPage: page }) => {
    await page.goto('/en/admin');
    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
  });

  test('Admin can view placeholder pages', async ({ adminPage: page }) => {
    const routes = ['/admin/analytics', '/admin/settings'];
    for (const route of routes) {
      await page.goto(`/en${route}`);
      await expect(page.getByText('Under Construction')).toBeVisible();
    }
  });

  test('Admin can view Users management page', async ({ adminPage: page }) => {
    await page.goto('/en/admin/users');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    // Headers
    await expect(page.getByRole('columnheader', { name: 'User', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Assigned Agent' })).toBeVisible();
  });
});
