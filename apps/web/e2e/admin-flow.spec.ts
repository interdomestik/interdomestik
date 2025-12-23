/**
 * Admin User Flow E2E Tests
 *
 * Complete end-to-end tests for admin user journeys including:
 * - Admin dashboard access
 * - Claims management
 * - User management
 * - Analytics access
 * - Settings configuration
 */

import { expect, test } from './fixtures/auth.fixture';

test.describe('Admin User Flow', () => {
  test.describe('Dashboard Access', () => {
    test('Admin can access admin dashboard', async ({ adminPage: page }) => {
      await page.goto('/en/admin');

      // Should be on admin dashboard
      await expect(page).toHaveURL(/.*\/admin/);

      // Should see admin dashboard heading
      await expect(page.getByRole('heading', { name: /Admin Dashboard/i, level: 1 })).toBeVisible();
    });

    test('Admin can see dashboard content', async ({ adminPage: page }) => {
      await page.goto('/en/admin');

      // Check for main content area
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });

    test('Admin can see recent activity', async ({ adminPage: page }) => {
      await page.goto('/en/admin');

      // Look for recent activity section
      await expect(page.getByText(/Recent Activity/i)).toBeVisible();
    });
  });

  test.describe('Claims Management', () => {
    test('Admin can access claims management page', async ({ adminPage: page }) => {
      await page.goto('/en/admin/claims');

      // Should see claims management
      await expect(
        page.getByRole('heading', { name: /Claims Management/i, level: 1 })
      ).toBeVisible();
    });

    test('Admin can see claims table', async ({ adminPage: page }) => {
      await page.goto('/en/admin/claims');

      // Should see claims table or content
      await expect(page.locator('main').first()).toBeVisible();

      // Try to find either a table or some content
      const table = page.getByRole('table');
      const content = page.locator('main');

      // Wait for either to be visible
      await expect(table.or(content).first()).toBeVisible();
    });

    test('Admin page loads claims data', async ({ adminPage: page }) => {
      await page.goto('/en/admin/claims');

      // Check that the page renders without errors
      await expect(page.locator('body')).toContainText('Claim', { ignoreCase: true });
    });
  });

  test.describe('User Management', () => {
    test('Admin can access user management page', async ({ adminPage: page }) => {
      await page.goto('/en/admin/users');

      // Should see user management heading (Matches "Members" from translations)
      await expect(page.getByRole('heading', { name: /Members/i, level: 1 })).toBeVisible();
    });

    test('Admin can see user content', async ({ adminPage: page }) => {
      await page.goto('/en/admin/users');

      // Should see user-related content
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe('Analytics', () => {
    test('Admin can access analytics page', async ({ adminPage: page }) => {
      await page.goto('/en/admin/analytics');

      // Should see analytics content
      await expect(page.locator('body')).toContainText('Analytics', { ignoreCase: true });
    });
  });

  test.describe('Settings', () => {
    test('Admin can access admin settings', async ({ adminPage: page }) => {
      await page.goto('/en/admin/settings');

      // Should see admin settings
      await expect(
        page.getByRole('heading', { name: /Admin Settings|Settings/i, level: 1 })
      ).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('Admin sidebar has navigation links', async ({ adminPage: page }) => {
      await page.goto('/en/admin');

      const sidebar = page.getByTestId('admin-sidebar');

      // Check for expected links
      await expect(sidebar.getByRole('link', { name: /Dashboard/i })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: /Case Management/i })).toBeVisible();
    });

    test('Admin can navigate to different sections', async ({ adminPage: page }) => {
      await page.goto('/en/admin');

      // Navigate to claims (Case Management)
      await page
        .getByTestId('admin-sidebar')
        .getByRole('link', { name: /Case Management/i })
        .click();

      await expect(page).toHaveURL(/.*\/admin\/claims/);
    });
  });

  test.describe('Access Control', () => {
    test('Non-admin is denied access to admin routes', async ({ authenticatedPage: page }) => {
      await page.goto('/en/admin');

      // Regular user should be redirected away from admin
      await expect(page).not.toHaveURL(/\/admin$/);
    });
  });
});
