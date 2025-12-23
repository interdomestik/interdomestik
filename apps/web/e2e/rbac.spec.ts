/**
 * Role-Based Access Control (RBAC) E2E Tests
 *
 * Comprehensive tests to verify strict role permissions across all user types.
 * Tests ensure that each role can ONLY access their permitted routes and actions.
 */

import { expect, test } from './fixtures/auth.fixture';

test.describe('Role-Based Access Control', () => {
  test.describe('Member Role Restrictions', () => {
    test('Member cannot access admin dashboard', async ({ authenticatedPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('domcontentloaded');

      // Should be redirected away - NOT on admin
      const url = page.url();
      expect(url).not.toMatch(/\/admin$/);
    });

    test('Member cannot access admin claims management', async ({ authenticatedPage: page }) => {
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).not.toContain('/admin/claims');
    });

    test('Member cannot access admin users management', async ({ authenticatedPage: page }) => {
      await page.goto('/en/admin/users');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).not.toContain('/admin/users');
    });

    test('Member cannot access admin analytics', async ({ authenticatedPage: page }) => {
      await page.goto('/en/admin/analytics');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).not.toContain('/admin/analytics');
    });

    test('Member cannot access agent workspace', async ({ authenticatedPage: page }) => {
      await page.goto('/en/agent');
      await page.waitForLoadState('domcontentloaded');

      // Member should be redirected to dashboard or denied
      const url = page.url();
      const isOnRestrictedPage = url.includes('/agent') && !url.includes('/member');
      // Either redirected or on dashboard
      expect(url.includes('/member') || !isOnRestrictedPage).toBeTruthy();
    });

    test('Member cannot access staff claims queue', async ({ authenticatedPage: page }) => {
      await page.goto('/en/staff/claims');
      await page.waitForLoadState('domcontentloaded');

      // Should not see staff claims queue
      const url = page.url();
      expect(url.includes('/member') || !url.includes('/staff/claims')).toBeTruthy();
    });

    test('Member CAN access their own dashboard', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/member');
    });

    test('Member CAN access their own claims', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member/claims');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/member/claims');
    });

    test('Member CAN access settings', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member/settings');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/settings');
    });
  });

  test.describe('Agent Role Restrictions', () => {
    test('Agent cannot access admin dashboard', async ({ agentPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).not.toMatch(/\/admin$/);
    });

    test('Agent cannot access admin claims management', async ({ agentPage: page }) => {
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).not.toContain('/admin/claims');
    });

    test('Agent cannot access admin users management', async ({ agentPage: page }) => {
      await page.goto('/en/admin/users');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).not.toContain('/admin/users');
    });

    test('Agent cannot access admin settings', async ({ agentPage: page }) => {
      await page.goto('/en/admin/settings');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).not.toContain('/admin/settings');
    });

    test('Agent CAN access agent workspace', async ({ agentPage: page }) => {
      await page.goto('/en/agent');
      await page.waitForLoadState('domcontentloaded');

      // Agent should have access to agent workspace
      const url = page.url();
      expect(url.includes('/agent')).toBeTruthy();
    });

    test('Agent cannot access staff claims queue', async ({ agentPage: page }) => {
      await page.goto('/en/staff/claims');
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      expect(url.includes('/agent') || !url.includes('/staff/claims')).toBeTruthy();
    });
  });

  test.describe('Staff Role Permissions', () => {
    test('Staff can access staff workspace', async ({ staffPage: page }) => {
      await page.goto('/en/staff');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/staff');
    });

    test('Staff can access staff claims', async ({ staffPage: page }) => {
      await page.goto('/en/staff/claims');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/staff');
    });

    test('Staff redirected from admin dashboard to dashboard', async ({ staffPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('domcontentloaded');

      // Staff is redirected to staff workspace (not allowed on full admin)
      const url = page.url();
      expect(url.includes('/staff') || !url.includes('/admin')).toBeTruthy();
    });

    test('Staff redirected from admin claims to dashboard', async ({ staffPage: page }) => {
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('domcontentloaded');

      // Staff is redirected to staff workspace (limited admin access)
      const url = page.url();
      expect(url.includes('/staff') || !url.includes('/admin/claims')).toBeTruthy();
    });
  });

  test.describe('Admin Role Permissions', () => {
    test('Admin can access admin dashboard', async ({ adminPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/admin');
      await expect(page.getByRole('heading', { name: /Admin Dashboard/i })).toBeVisible();
    });

    test('Admin can access admin claims', async ({ adminPage: page }) => {
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/admin/claims');
    });

    test('Admin can access admin users', async ({ adminPage: page }) => {
      await page.goto('/en/admin/users');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/admin/users');
    });

    test('Admin can access admin analytics', async ({ adminPage: page }) => {
      await page.goto('/en/admin/analytics');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/admin/analytics');
    });

    test('Admin can access admin settings', async ({ adminPage: page }) => {
      await page.goto('/en/admin/settings');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/admin/settings');
    });

    test('Admin is redirected away from agent workspace', async ({ adminPage: page }) => {
      await page.goto('/en/agent');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).not.toContain('/agent');
    });
  });
});
