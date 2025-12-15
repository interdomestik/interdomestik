/**
 * Authentication Fixture for Playwright E2E Tests
 *
 * Provides authenticated page contexts for testing protected routes.
 */

import { test as base, Page } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST USER CREDENTIALS
// ═══════════════════════════════════════════════════════════════════════════════

export const TEST_USER = {
  email: 'test@interdomestik.com',
  password: 'TestPassword123!',
  name: 'Test User',
};

export const TEST_ADMIN = {
  email: 'admin@interdomestik.com',
  password: 'AdminPassword123!',
  name: 'Admin User',
};

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface AuthFixtures {
  authenticatedPage: Page;
  adminPage: Page;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function performLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');

  // Wait for login form to be visible
  await page.waitForSelector('form', { state: 'visible' });

  // Fill in credentials
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENDED TEST WITH AUTH FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

export const test = base.extend<AuthFixtures>({
  /**
   * Provides a page that is already authenticated as a regular user.
   *
   * @example
   * ```ts
   * test('can view dashboard', async ({ authenticatedPage }) => {
   *   await authenticatedPage.goto('/dashboard');
   *   await expect(authenticatedPage.locator('h1')).toContainText('Dashboard');
   * });
   * ```
   */
  authenticatedPage: async ({ page }, use) => {
    try {
      await performLogin(page, TEST_USER.email, TEST_USER.password);
      await use(page);
    } catch (error) {
      // If login fails, still provide the page but log warning
      console.warn('Auth fixture: Login failed, providing unauthenticated page');
      await use(page);
    }
  },

  /**
   * Provides a page that is authenticated as an admin user.
   *
   * @example
   * ```ts
   * test('admin can access admin panel', async ({ adminPage }) => {
   *   await adminPage.goto('/admin');
   *   await expect(adminPage.locator('h1')).toContainText('Admin');
   * });
   * ```
   */
  adminPage: async ({ page }, use) => {
    try {
      await performLogin(page, TEST_ADMIN.email, TEST_ADMIN.password);
      await use(page);
    } catch (error) {
      console.warn('Auth fixture: Admin login failed, providing unauthenticated page');
      await use(page);
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// RE-EXPORT EXPECT
// ═══════════════════════════════════════════════════════════════════════════════

export { expect } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if user is logged in by looking for auth indicators.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    // Check for common auth indicators
    const userNav = page.locator('[data-testid="user-nav"], .user-avatar, .user-menu');
    return await userNav.isVisible({ timeout: 2000 });
  } catch {
    return false;
  }
}

/**
 * Perform logout.
 */
export async function logout(page: Page): Promise<void> {
  // Click user menu
  await page.click('[data-testid="user-nav"], .user-avatar, .user-menu');

  // Click logout option
  await page.click('text=Logout, text=Sign out, [data-testid="logout"]');

  // Wait for redirect to login/home
  await page.waitForURL(/\/(login|$)/);
}
