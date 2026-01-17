/**
 * Role-Based Access Control (RBAC) E2E Tests
 *
 * Comprehensive tests to verify strict role permissions across all user types.
 * Tests ensure that each role can ONLY access their permitted routes and actions.
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Role-Based Access Control', () => {
  test.describe('Member Role Restrictions', () => {
    test('Member cannot access admin dashboard', async ({ authenticatedPage: page }) => {
      await page.goto(routes.admin());
      await page.waitForLoadState('domcontentloaded');

      // Strict check for 404 UI
      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    test('Member cannot access admin claims management', async ({ authenticatedPage: page }) => {
      await page.goto(routes.adminClaims());
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    test('Member cannot access admin users management', async ({ authenticatedPage: page }) => {
      await page.goto(routes.adminUsers());
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    test('Member cannot access admin analytics', async ({ authenticatedPage: page }) => {
      await page.goto(routes.adminAnalytics());
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    test('Member cannot access agent workspace', async ({ authenticatedPage: page }) => {
      await page.goto(routes.agent());
      await page.waitForLoadState('domcontentloaded');

      // Member should be denied (404 UI)
      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    test('Member cannot access staff claims queue', async ({ authenticatedPage: page }) => {
      await page.goto(routes.staffClaims());
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    test('Member CAN access their own dashboard', async ({ authenticatedPage: page }) => {
      await page.goto(routes.member());
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/member');
    });

    test('Member CAN access their own claims', async ({ authenticatedPage: page }) => {
      await page.goto(routes.memberClaims());
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/member/claims');
    });

    test('Member CAN access settings', async ({ authenticatedPage: page }) => {
      await page.goto(routes.memberSettings());
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/settings');
    });
  });

  test.describe('Agent Role Restrictions', () => {
    test('Agent cannot access admin dashboard', async ({ agentPage: page }) => {
      await page.goto(routes.admin());
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    test('Agent cannot access admin claims management', async ({ agentPage: page }) => {
      await page.goto(routes.adminClaims());
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    test('Agent cannot access admin users management', async ({ agentPage: page }) => {
      await page.goto(routes.adminUsers());
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    test('Agent cannot access admin settings', async ({ agentPage: page }) => {
      await page.goto(routes.adminSettings());
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    test('Agent CAN access agent workspace', async ({ agentPage: page }) => {
      await page.goto(routes.agent());
      await page.waitForLoadState('domcontentloaded');

      // Agent should have access to agent workspace
      const url = page.url();
      expect(url.includes('/agent')).toBeTruthy();
    });

    test('Agent cannot access staff claims queue', async ({ agentPage: page }) => {
      await page.goto(routes.staffClaims());
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });
  });

  test.describe('Staff Role Permissions', () => {
    test('Staff can access staff workspace', async ({ staffPage: page }) => {
      await page.goto(routes.staff());
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/staff');
    });

    test('Staff can access staff claims', async ({ staffPage: page }) => {
      await page.goto(routes.staffClaims());
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/staff');
    });

    test('Staff cannot access admin dashboard', async ({ staffPage: page }) => {
      await page.goto(routes.admin());
      await page.waitForLoadState('domcontentloaded');

      // Staff should be denied (404 UI)
      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    test('Staff cannot access admin claims management', async ({ staffPage: page }) => {
      await page.goto(routes.adminClaims());
      await page.waitForLoadState('domcontentloaded');

      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });
    // ...

    test('Admin cannot access agent workspace', async ({ adminPage: page }) => {
      await page.goto(routes.agent());
      await page.waitForLoadState('domcontentloaded');

      // Admin should be denied (404 UI)
      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });
  });
});
