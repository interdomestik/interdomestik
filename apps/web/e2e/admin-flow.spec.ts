/**
 * Admin User Flow E2E Tests
 *
 * Complete end-to-end tests for admin user journeys including:
 * - Admin dashboard access
 * - Claims management (Operational Center)
 * - User management
 * - Analytics access
 * - Settings configuration
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Admin User Flow', () => {
  test.describe('Dashboard Access', () => {
    test('Admin can access admin dashboard', async ({ adminPage: page }) => {
      await page.goto(routes.admin());

      // Should be on admin dashboard
      await expect(page).toHaveURL(/.*\/admin/);

      // Should see admin panel heading (multilingual: "Admin Panel" or locale variant)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    test('Admin can see dashboard content', async ({ adminPage: page }) => {
      await page.goto(routes.admin());

      // Check for main content area
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });

    test('Admin can see operational center', async ({ adminPage: page }) => {
      await page.goto(routes.adminClaims());

      // The admin dashboard is the Operational Center with claims overview
      // Check for heading that exists in both locales
      await expect(page.locator('main').first()).toBeVisible();

      // Check for any status filter buttons (common UI pattern)
      const statusButtons = page.locator('button').filter({ hasText: /Të gjitha|All|Сите/i });
      await expect(statusButtons.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Claims Management', () => {
    test('Admin can access claims page', async ({ adminPage: page }) => {
      await page.goto(routes.adminClaims());

      // Should see claims page heading (multilingual)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    test('Admin can see claims content', async ({ adminPage: page }) => {
      await page.goto(routes.adminClaims());

      // Should see main content
      await expect(page.locator('main').first()).toBeVisible();
    });

    test('Admin page loads claims data', async ({ adminPage: page }) => {
      await page.goto(routes.adminClaims());

      // Check that the page renders without errors - look for any claim number pattern
      await expect(page.locator('body')).toContainText(/CLM-|Kërkesa|Claim|Барање/i);
    });
  });

  test.describe('User Management', () => {
    test('Admin can access user management page', async ({ adminPage: page }) => {
      await page.goto(routes.adminUsers());

      // Should see user management heading (multilingual)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    test('Admin can see user content', async ({ adminPage: page }) => {
      await page.goto(routes.adminUsers());

      // Should see user-related content
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe('Analytics', () => {
    test('Admin can access analytics page', async ({ adminPage: page }) => {
      await page.goto(routes.adminAnalytics());

      // Should see analytics content (multilingual)
      await expect(page.locator('body')).toContainText(/Analytics|Analitika|Аналитика/i);
    });
  });

  test.describe('Settings', () => {
    test('Admin can access admin settings', async ({ adminPage: page }) => {
      await page.goto(routes.adminSettings());

      // Should see settings page content
      await expect(page.locator('main').first()).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('Admin sidebar has navigation links', async ({ adminPage: page }) => {
      await page.goto(routes.admin());

      // Check for navigation links in sidebar (using common patterns)
      const sidebar = page.getByTestId('admin-sidebar').first();
      await expect(sidebar).toBeVisible();

      // Check for at least one navigation link
      const navLinks = sidebar.getByRole('link');
      await expect(navLinks.first()).toBeVisible();
    });

    test('Admin can navigate to different sections', async ({ adminPage: page }) => {
      await page.goto(routes.admin());

      // Use the sidebar container specifically
      const sidebar = page.getByTestId('admin-sidebar').first();

      // Find a claims/requests link and click it
      // In Sidebar, it might be a button or link with specific text
      const claimsLink = sidebar.getByRole('link', { name: /Kërkesat|Claims|Барања/i }).first();
      await expect(claimsLink).toBeVisible();
      await claimsLink.click();

      await expect(page).toHaveURL(/.*\/admin\/claims/);
    });
  });

  test.describe('Access Control', () => {
    test('Non-admin is denied access to admin routes', async ({ authenticatedPage: page }) => {
      await page.goto(routes.admin());

      // Regular user should be redirected away from admin
      await expect(page).not.toHaveURL(/\/admin$/);
    });
  });
});
