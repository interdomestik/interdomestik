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
import { gotoApp } from './utils/navigation';

test.describe('Admin User Flow', () => {
  test.describe('Dashboard Access', () => {
    test('Admin can access admin dashboard', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.admin(), testInfo);

      // Should be on admin dashboard
      await expect(page).toHaveURL(/.*\/admin/);

      // Should see admin panel heading (multilingual: "Admin Panel" or locale variant)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    test('Admin can see dashboard content', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.admin(), testInfo);

      // Check for main content area
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });

    test('Admin can see operational center', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.adminClaims(), testInfo);

      // The admin dashboard is the Operational Center with claims overview
      // Check for heading that exists in both locales
      await expect(page.locator('main').first()).toBeVisible();

      // Check for Ops Center queue sidebar and "All" item (verifies the new UI structure)
      const queueAll = page.getByTestId('queue-all');
      await expect(queueAll).toBeVisible({ timeout: 10000 });
      await expect(queueAll).toContainText(/Të gjitha|All|Сите/i);
    });
  });

  test.describe('Claims Management', () => {
    test('Admin can access claims page', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.adminClaims(), testInfo);

      // Should see claims page heading (multilingual)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    test('Admin can see claims content', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.adminClaims(), testInfo);

      // Should see main content
      await expect(page.locator('main').first()).toBeVisible();
    });

    test('Admin page loads claims data', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.adminClaims(), testInfo);

      // Check that the page renders without errors - look for any claim number pattern
      await expect(page.locator('body')).toContainText(/CLM-|Kërkesa|Claim|Барање/i);
    });
  });

  test.describe('User Management', () => {
    test('Admin can access user management page', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.adminUsers(), testInfo);

      // Should see user management heading (multilingual)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    test('Admin can see user content', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.adminUsers(), testInfo);

      // Should see user-related content
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe('Analytics', () => {
    test('Admin can access analytics page', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.adminAnalytics(), testInfo);

      // Should see analytics content (multilingual)
      await expect(page.locator('body')).toContainText(/Analytics|Analitika|Аналитика/i);
    });
  });

  test.describe('Settings', () => {
    test('Admin can access admin settings', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.adminSettings(), testInfo);

      // Should see settings page content
      await expect(page.locator('main').first()).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('Admin sidebar has navigation links', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.admin(), testInfo);

      // Check for navigation links in sidebar (using common patterns)
      const sidebar = page.getByTestId('admin-sidebar').first();
      await expect(sidebar).toBeVisible();

      // Check for at least one navigation link
      const navLinks = sidebar.getByRole('link');
      await expect(navLinks.first()).toBeVisible();
    });

    test('Admin can navigate to different sections', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.admin(), testInfo);

      // Use the sidebar container specifically
      const sidebar = page.getByTestId('admin-sidebar').first();

      // Find a claims/requests link using href attribute which is safer than text
      const claimsLink = sidebar.locator('a[href*="/admin/claims"]').first();
      await expect(claimsLink).toBeVisible();
      await claimsLink.click();

      await expect(page).toHaveURL(/.*\/admin\/claims/);
    });
  });

  test.describe('Access Control', () => {
    test('Non-admin is denied access to admin routes', async ({
      authenticatedPage: page,
    }, testInfo) => {
      await gotoApp(page, routes.admin(), testInfo);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500); // Allow redirect to complete

      // App uses redirect-first strategy: members are sent to /member, not shown 404
      const currentPath = new URL(page.url()).pathname;
      // Normalize: remove locale prefix like /sq/ or /mk/ for comparison
      const normalizedPath = currentPath.replace(/^\/[a-z]{2}\//, '/').replace(/^\/[a-z]{2}$/, '/');
      const isOnAdmin = normalizedPath.startsWith('/admin');

      if (isOnAdmin) {
        // If still on admin path, expect 404 UI
        await expect(
          page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
        ).toBeVisible({ timeout: 5000 });
      } else {
        // Redirected away from admin (to /member) is valid denial
        expect(normalizedPath).toMatch(/^\/member/);
      }
    });
  });
});
