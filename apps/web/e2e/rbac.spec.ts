/**
 * Role-Based Access Control (RBAC) E2E Tests
 *
 * Comprehensive tests to verify strict role permissions across all user types.
 * Tests ensure that each role can ONLY access their permitted routes and actions.
 *
 * The app uses a REDIRECT-first strategy: unauthorized users are sent to their
 * correct portal (e.g., member → /member) rather than showing a 404.
 * Only unknown roles get a 404.
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

/**
 * Helper to assert that a user was denied access to a route.
 * Accepts EITHER:
 * 1. Redirect away from the forbidden path
 * 2. 404 Not Found page (for unknown roles)
 */
async function expectAccessDenied(
  page: import('@playwright/test').Page,
  forbiddenPathSegment: string,
  expectedRedirectPattern?: RegExp
) {
  // Wait for any redirect to complete
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500); // Allow redirect to settle

  const currentPath = new URL(page.url()).pathname;

  // Normalize: remove locale prefix like /sq/ or /mk/ from current path for comparison
  const normalizedCurrentPath = currentPath
    .replace(/^\/[a-z]{2}\//, '/')
    .replace(/^\/[a-z]{2}$/, '/');

  // Check if user is still on the forbidden path segment
  const isOnForbiddenPath = normalizedCurrentPath.startsWith(forbiddenPathSegment);

  if (isOnForbiddenPath) {
    // If still on forbidden path, expect 404 UI
    await expect(
      page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
    ).toBeVisible({ timeout: 5000 });
  } else {
    // Redirected away — verify we're at the expected destination
    if (expectedRedirectPattern) {
      expect(normalizedCurrentPath).toMatch(expectedRedirectPattern);
    }
    // Either way, we should NOT be on the forbidden path
    expect(normalizedCurrentPath).not.toContain(forbiddenPathSegment);
  }
}

test.describe('Role-Based Access Control', () => {
  test.describe('Member Role Restrictions', () => {
    test('Member cannot access admin dashboard', async ({ authenticatedPage: page }) => {
      await page.goto(routes.admin());
      await expectAccessDenied(page, '/admin', /\/member/);
    });

    test('Member cannot access admin claims management', async ({ authenticatedPage: page }) => {
      await page.goto(routes.adminClaims());
      await expectAccessDenied(page, '/admin/claims', /\/member/);
    });

    test('Member cannot access admin users management', async ({ authenticatedPage: page }) => {
      await page.goto(routes.adminUsers());
      await expectAccessDenied(page, '/admin/users', /\/member/);
    });

    test('Member cannot access admin analytics', async ({ authenticatedPage: page }) => {
      await page.goto(routes.adminAnalytics());
      await expectAccessDenied(page, '/admin/analytics', /\/member/);
    });

    test('Member cannot access agent workspace', async ({ authenticatedPage: page }) => {
      await page.goto(routes.agent());
      await expectAccessDenied(page, '/agent', /\/member/);
    });

    test('Member cannot access staff claims queue', async ({ authenticatedPage: page }) => {
      await page.goto(routes.staffClaims());
      await expectAccessDenied(page, '/staff/claims', /\/member/);
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
      await expectAccessDenied(page, '/admin', /\/agent/);
    });

    test('Agent cannot access admin claims management', async ({ agentPage: page }) => {
      await page.goto(routes.adminClaims());
      await expectAccessDenied(page, '/admin/claims', /\/agent/);
    });

    test('Agent cannot access admin users management', async ({ agentPage: page }) => {
      await page.goto(routes.adminUsers());
      await expectAccessDenied(page, '/admin/users', /\/agent/);
    });

    test('Agent cannot access admin settings', async ({ agentPage: page }) => {
      await page.goto(routes.adminSettings());
      await expectAccessDenied(page, '/admin/settings', /\/agent/);
    });

    test('Agent CAN access agent workspace', async ({ agentPage: page }) => {
      await page.goto(routes.agent());
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      expect(url.includes('/agent')).toBeTruthy();
    });

    test('Agent cannot access staff claims queue', async ({ agentPage: page }) => {
      await page.goto(routes.staffClaims());
      await expectAccessDenied(page, '/staff/claims', /\/agent/);
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
      await expectAccessDenied(page, '/admin', /\/staff/);
    });

    test('Staff cannot access admin claims management', async ({ staffPage: page }) => {
      await page.goto(routes.adminClaims());
      await expectAccessDenied(page, '/admin/claims', /\/staff/);
    });

    test('Admin cannot access agent workspace', async ({ adminPage: page }) => {
      await page.goto(routes.agent());
      await expectAccessDenied(page, '/agent', /\/admin/);
    });
  });
});
