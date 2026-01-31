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
import { gotoApp } from './utils/navigation';

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

  // NEGATIVE ASSERTION: Ensure privileged UI elements are strictly ABSENT.
  // This prevents false negatives where the page renders 200 OK with admin content but the 404 check was skipped.
  await expect(
    page.getByTestId('admin-sidebar'),
    `Security Breach: Admin sidebar visible on "${currentPath}"`
  ).not.toBeVisible();

  if (isOnForbiddenPath) {
    // If still on forbidden path, expect 404 UI
    const notFoundMarkerVisible = await page
      .getByTestId('not-found-page')
      .isVisible()
      .catch(() => false);

    if (!notFoundMarkerVisible) {
      const html = await page.content();
      const isNextFallback404 = html.includes('NEXT_HTTP_ERROR_FALLBACK;404');
      const isNoIndex = (await page.locator('meta[name="robots"][content="noindex"]').count()) > 0;

      // If we don't have our custom UI, we MUST have a valid Next.js/Framework 404 signature
      expect(
        isNextFallback404 || isNoIndex,
        `Expected 404 UI, Next.js fallback, or noindex on forbidden path "${normalizedCurrentPath}"`
      ).toBeTruthy();
    } else {
      await expect(page.getByTestId('not-found-page')).toBeVisible();
    }
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
    test('Member cannot access admin dashboard', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.admin(testInfo), testInfo);
      await expectAccessDenied(page, '/admin', /\/member/);
    });

    test('Member cannot access admin claims management', async ({
      authenticatedPage: page,
    }, testInfo) => {
      await gotoApp(page, routes.adminClaims(testInfo), testInfo);
      await expectAccessDenied(page, '/admin/claims', /\/member/);
    });

    test('Member cannot access admin users management', async ({
      authenticatedPage: page,
    }, testInfo) => {
      await gotoApp(page, routes.adminUsers(testInfo), testInfo);
      await expectAccessDenied(page, '/admin/users', /\/member/);
    });

    test('Member cannot access admin analytics', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.adminAnalytics(testInfo), testInfo);
      await expectAccessDenied(page, '/admin/analytics', /\/member/);
    });

    test('Member cannot access agent workspace', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.agent(testInfo), testInfo);
      await expectAccessDenied(page, '/agent', /\/member/);
    });

    test('Member cannot access staff claims queue', async ({
      authenticatedPage: page,
    }, testInfo) => {
      await gotoApp(page, routes.staffClaims(testInfo), testInfo);
      await expectAccessDenied(page, '/staff/claims', /\/member/);
    });

    test('Member CAN access their own dashboard', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.member(testInfo), testInfo);
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/member');
    });

    test('Member CAN access their own claims', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.memberClaims(testInfo), testInfo);
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/member/claims');
    });

    test('Member CAN access settings', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.memberSettings(testInfo), testInfo);
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/settings');
    });
  });

  test.describe('Agent Role Restrictions', () => {
    test('Agent cannot access admin dashboard', async ({ agentPage: page }, testInfo) => {
      await gotoApp(page, routes.admin(testInfo), testInfo);
      await expectAccessDenied(page, '/admin', /\/agent/);
    });

    test('Agent cannot access admin claims management', async ({ agentPage: page }, testInfo) => {
      await gotoApp(page, routes.adminClaims(testInfo), testInfo);
      await expectAccessDenied(page, '/admin/claims', /\/agent/);
    });

    test('Agent cannot access admin users management', async ({ agentPage: page }, testInfo) => {
      await gotoApp(page, routes.adminUsers(testInfo), testInfo);
      await expectAccessDenied(page, '/admin/users', /\/agent/);
    });

    test('Agent cannot access admin settings', async ({ agentPage: page }, testInfo) => {
      await gotoApp(page, routes.adminSettings(testInfo), testInfo);
      await expectAccessDenied(page, '/admin/settings', /\/agent/);
    });

    test('Agent CAN access agent workspace', async ({ agentPage: page }, testInfo) => {
      await gotoApp(page, routes.agent(testInfo), testInfo);
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      expect(url.includes('/agent')).toBeTruthy();
    });

    test('Agent cannot access staff claims queue', async ({ agentPage: page }, testInfo) => {
      await gotoApp(page, routes.staffClaims(testInfo), testInfo);
      await expectAccessDenied(page, '/staff/claims', /\/agent/);
    });
  });

  test.describe('Staff Role Permissions', () => {
    test('Staff can access staff workspace', async ({ staffPage: page }, testInfo) => {
      await gotoApp(page, routes.staff(testInfo), testInfo);
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/staff');
    });

    test('Staff can access staff claims', async ({ staffPage: page }, testInfo) => {
      await gotoApp(page, routes.staffClaims(testInfo), testInfo);
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/staff');
    });

    test('Staff cannot access admin dashboard', async ({ staffPage: page }, testInfo) => {
      await gotoApp(page, routes.admin(testInfo), testInfo);
      await expectAccessDenied(page, '/admin', /\/staff/);
    });

    test('Staff cannot access admin claims management', async ({ staffPage: page }, testInfo) => {
      await gotoApp(page, routes.adminClaims(testInfo), testInfo);
      await expectAccessDenied(page, '/admin/claims', /\/staff/);
    });

    test('Admin cannot access agent workspace', async ({ adminPage: page }, testInfo) => {
      await gotoApp(page, routes.agent(testInfo), testInfo);
      await expectAccessDenied(page, '/agent', /\/admin/);
    });
  });
});
