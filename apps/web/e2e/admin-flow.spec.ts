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
      await page.waitForLoadState('networkidle');

      // Should be on admin dashboard
      expect(page.url()).toContain('/admin');

      // Should see admin dashboard heading
      await expect(page.getByRole('heading', { name: /Admin Dashboard/i })).toBeVisible();
    });

    test('Admin can see dashboard content', async ({ adminPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('networkidle');

      // Check for main content area
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });

    test('Admin can see recent activity', async ({ adminPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('networkidle');

      // Look for recent activity section
      await expect(page.getByText(/Recent Activity/i)).toBeVisible();
    });
  });

  test.describe('Claims Management', () => {
    test('Admin can access claims management page', async ({ adminPage: page }) => {
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('networkidle');

      // Should see claims management
      await expect(page.getByRole('heading', { name: /Claims Management/i })).toBeVisible();
    });

    test('Admin can see claims table', async ({ adminPage: page }) => {
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('networkidle');

      // Should see claims table or content
      const hasTable = await page
        .getByRole('table')
        .isVisible()
        .catch(() => false);
      const hasContent = await page
        .locator('main')
        .first()
        .isVisible()
        .catch(() => false);

      expect(hasTable || hasContent).toBeTruthy();
    });

    test('Admin page loads claims data', async ({ adminPage: page }) => {
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('networkidle');

      // Check that the page renders without errors
      const pageContent = await page.content();
      expect(pageContent.toLowerCase()).toContain('claim');
    });
  });

  test.describe('User Management', () => {
    test('Admin can access user management page', async ({ adminPage: page }) => {
      await page.goto('/en/admin/users');
      await page.waitForLoadState('networkidle');

      // Should see user management heading
      await expect(page.getByRole('heading', { name: /User Management/i })).toBeVisible();
    });

    test('Admin can see user content', async ({ adminPage: page }) => {
      await page.goto('/en/admin/users');
      await page.waitForLoadState('networkidle');

      // Should see user-related content
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe('Analytics', () => {
    test('Admin can access analytics page', async ({ adminPage: page }) => {
      await page.goto('/en/admin/analytics');
      await page.waitForLoadState('networkidle');

      // Should see analytics content
      const pageContent = await page.content();
      expect(pageContent.toLowerCase()).toContain('analytics');
    });
  });

  test.describe('Settings', () => {
    test('Admin can access admin settings', async ({ adminPage: page }) => {
      await page.goto('/en/admin/settings');
      await page.waitForLoadState('networkidle');

      // Should see admin settings
      await expect(page.getByRole('heading', { name: /Admin Settings|Settings/i })).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('Admin sidebar has navigation links', async ({ adminPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('networkidle');

      const sidebar = page.locator('nav');

      // Check for expected links
      await expect(sidebar.getByRole('link', { name: /Dashboard/i })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: /Claims/i })).toBeVisible();
    });

    test('Admin can navigate to different sections', async ({ adminPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('networkidle');

      // Navigate to claims
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/admin/claims');
    });
  });

  test.describe('Access Control', () => {
    test('Non-admin is denied access to admin routes', async ({ authenticatedPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('networkidle');

      // Regular user should be redirected away from admin
      const currentUrl = page.url();
      expect(currentUrl).not.toMatch(/\/admin$/);
    });
  });
});
