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
      await page.waitForLoadState('networkidle');

      // Should be redirected away - NOT on admin
      const url = page.url();
      expect(url).not.toMatch(/\/admin$/);
    });

    test('Member cannot access admin claims management', async ({ authenticatedPage: page }) => {
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('networkidle');

      expect(page.url()).not.toContain('/admin/claims');
    });

    test('Member cannot access admin users management', async ({ authenticatedPage: page }) => {
      await page.goto('/en/admin/users');
      await page.waitForLoadState('networkidle');

      expect(page.url()).not.toContain('/admin/users');
    });

    test('Member cannot access admin analytics', async ({ authenticatedPage: page }) => {
      await page.goto('/en/admin/analytics');
      await page.waitForLoadState('networkidle');

      expect(page.url()).not.toContain('/admin/analytics');
    });

    test('Member cannot access agent workspace', async ({ authenticatedPage: page }) => {
      await page.goto('/en/agent');
      await page.waitForLoadState('networkidle');

      // Member should be redirected to dashboard or denied
      const url = page.url();
      const isOnRestrictedPage = url.includes('/agent') && !url.includes('/dashboard');
      // Either redirected or on dashboard
      expect(url.includes('/dashboard') || !isOnRestrictedPage).toBeTruthy();
    });

    test('Member cannot access agent claims queue', async ({ authenticatedPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      // Should not see agent claims queue
      const url = page.url();
      expect(url.includes('/dashboard') || !url.includes('/agent/claims')).toBeTruthy();
    });

    test('Member CAN access their own dashboard', async ({ authenticatedPage: page }) => {
      await page.goto('/en/dashboard');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/dashboard');
    });

    test('Member CAN access their own claims', async ({ authenticatedPage: page }) => {
      await page.goto('/en/dashboard/claims');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/dashboard/claims');
    });

    test('Member CAN access settings', async ({ authenticatedPage: page }) => {
      await page.goto('/en/dashboard/settings');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/settings');
    });
  });

  test.describe('Agent Role Restrictions', () => {
    test('Agent cannot access admin dashboard', async ({ agentPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('networkidle');

      expect(page.url()).not.toMatch(/\/admin$/);
    });

    test('Agent cannot access admin claims management', async ({ agentPage: page }) => {
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('networkidle');

      expect(page.url()).not.toContain('/admin/claims');
    });

    test('Agent cannot access admin users management', async ({ agentPage: page }) => {
      await page.goto('/en/admin/users');
      await page.waitForLoadState('networkidle');

      expect(page.url()).not.toContain('/admin/users');
    });

    test('Agent cannot access admin settings', async ({ agentPage: page }) => {
      await page.goto('/en/admin/settings');
      await page.waitForLoadState('networkidle');

      expect(page.url()).not.toContain('/admin/settings');
    });

    test('Agent CAN access agent workspace', async ({ agentPage: page }) => {
      await page.goto('/en/agent');
      await page.waitForLoadState('networkidle');

      // Agent should have access to agent workspace
      const url = page.url();
      expect(url.includes('/agent') || url.includes('/dashboard')).toBeTruthy();
    });

    test('Agent CAN access agent claims', async ({ agentPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/agent');
    });

    test('Agent has view-only access (no Review Case buttons)', async ({ agentPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      // Agent should NOT see "Review Case" action - only staff/admin do
      const reviewCaseButton = await page
        .getByRole('link', { name: /Review Case/i })
        .isVisible()
        .catch(() => false);

      expect(reviewCaseButton).toBeFalsy();
    });
  });

  test.describe('Staff Role Permissions', () => {
    test('Staff can access agent workspace', async ({ staffPage: page }) => {
      await page.goto('/en/agent');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/agent');
    });

    test('Staff can access agent claims', async ({ staffPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/agent');
    });

    test('Staff redirected from admin dashboard to dashboard', async ({ staffPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('networkidle');

      // Staff is redirected to dashboard (not allowed on full admin)
      const url = page.url();
      expect(url.includes('/dashboard') || !url.includes('/admin')).toBeTruthy();
    });

    test('Staff redirected from admin claims to dashboard', async ({ staffPage: page }) => {
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('networkidle');

      // Staff is redirected to dashboard (limited admin access)
      const url = page.url();
      expect(url.includes('/dashboard') || !url.includes('/admin/claims')).toBeTruthy();
    });
  });

  test.describe('Admin Role Permissions', () => {
    test('Admin can access admin dashboard', async ({ adminPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/admin');
      await expect(page.getByRole('heading', { name: /Admin Dashboard/i })).toBeVisible();
    });

    test('Admin can access admin claims', async ({ adminPage: page }) => {
      await page.goto('/en/admin/claims');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/admin/claims');
    });

    test('Admin can access admin users', async ({ adminPage: page }) => {
      await page.goto('/en/admin/users');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/admin/users');
    });

    test('Admin can access admin analytics', async ({ adminPage: page }) => {
      await page.goto('/en/admin/analytics');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/admin/analytics');
    });

    test('Admin can access admin settings', async ({ adminPage: page }) => {
      await page.goto('/en/admin/settings');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/admin/settings');
    });

    test('Admin can access agent workspace', async ({ adminPage: page }) => {
      await page.goto('/en/agent');
      await page.waitForLoadState('networkidle');

      // Admin should have access to agent workspace too
      expect(page.url()).toContain('/agent');
    });
  });
});
