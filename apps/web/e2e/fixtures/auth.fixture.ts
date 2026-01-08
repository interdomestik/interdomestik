/**
 * Authentication Fixture for Playwright E2E Tests
 *
 * Provides authenticated page contexts for testing protected routes.
 * Features:
 * - Deterministic UI login with proper wait conditions
 * - Locale-aware URL matching (/en/login, /sq/login, etc.)
 * - Verification via user-nav element or session cookie
 * - StorageState helpers for faster test runs
 */

import { test as base, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { routes } from '../routes';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Locale-aware login URL matcher - handles /login, /signin, /en/login, /sq/login, etc.
const LOGIN_RX = /(?:\/[a-z]{2})?\/(?:login|signin|auth\/sign-in)(?:\/)?(?:\?|$)/i;

// Where to navigate for login (router will redirect to locale-prefixed route)
const DEFAULT_LOCALE = process.env.PLAYWRIGHT_LOCALE ?? 'en';
const SIGNIN_PATH = routes.login(DEFAULT_LOCALE);

// Locators that only appear when logged in
const AUTH_OK_SELECTORS = ['[data-testid="user-nav"]', '[data-testid="sidebar-user-menu-button"]'];

// ═══════════════════════════════════════════════════════════════════════════════
// TEST USER CREDENTIALS
// ═══════════════════════════════════════════════════════════════════════════════

type Role = 'member' | 'admin' | 'agent' | 'staff' | 'branch_manager';

function ipForRole(role: Role): string {
  // If rate limiting is enabled in e2e (Upstash env vars set), many requests can otherwise
  // end up keyed under IP=unknown. Give each role a stable, distinct IP.
  switch (role) {
    case 'member':
      return '10.0.0.11';
    case 'admin':
      return '10.0.0.12';
    case 'agent':
      return '10.0.0.13';
    case 'staff':
      return '10.0.0.14';
    default:
      return '10.0.0.10';
  }
}

const CREDS: Record<Role, { email: string; password: string; name: string }> = {
  member: {
    email: 'test@interdomestik.com',
    password: 'TestPassword123!',
    name: 'Test User',
  },
  admin: {
    email: 'admin@interdomestik.com',
    password: 'AdminPassword123!',
    name: 'Admin User',
  },
  agent: {
    email: 'agent@interdomestik.com',
    password: 'AgentPassword123!',
    name: 'Agent User',
  },
  staff: {
    email: 'staff@interdomestik.com',
    password: 'StaffPassword123!',
    name: 'Staff User',
  },
  branch_manager: {
    email: 'bm@interdomestik.com',
    password: 'BmPassword123!',
    name: 'Branch Manager A',
  },
};

// Legacy exports for backward compatibility
export const TEST_USER = CREDS.member;
export const TEST_ADMIN = CREDS.admin;
export const TEST_AGENT = CREDS.agent;
export const TEST_STAFF = CREDS.staff;
export const TEST_BM = CREDS.branch_manager;

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function performLogin(page: Page, role: Role): Promise<void> {
  const { email, password } = CREDS[role];

  // ... (rest of performLogin)
}

// ...

interface AuthFixtures {
  loginAs: (role: Role) => Promise<void>;
  saveState: (role: Role) => Promise<void>;
  authenticatedPage: Page;
  adminPage: Page;
  agentPage: Page;
  staffPage: Page;
  branchManagerPage: Page;
}

export const test = base.extend<AuthFixtures>({
  loginAs: async ({ page }, use) => {
    await use(async (role: Role) => {
      await performLogin(page, role);
    });
  },

  saveState: async ({ page }, use) => {
    await use(async (role: Role) => {
      const statePath = storageStateFile(role);
      // If force regen is off and it exists, we shouldn't be here, but for safety:
      // Real usage pattern in setup test handles the check.
      // Here we just do the work.

      // Ensure we are logged in as that role
      // Note: We reuse the single 'page' fixture, so it might have old state.
      // Ideally setup tests run in isolation.
      await performLogin(page, role);

      // Save state
      await page.context().storageState({ path: statePath });
    });
  },

  /**
   * Generic authenticated page (defaults to member if not specified)
   */
  authenticatedPage: async ({ page }, use) => {
    if (!(await isLoggedIn(page))) {
      await performLogin(page, 'member');
    }
    await use(page);
  },

  /**
   * Page authenticated as admin
   */
  adminPage: async ({ browser }, use) => {
    const statePath = storageStateFile('admin');
    const context = await browser.newContext({
      storageState: (await storageStateExists(statePath)) ? statePath : undefined,
      locale: 'en-US',
      extraHTTPHeaders: { 'x-forwarded-for': ipForRole('admin') },
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      await performLogin(page, 'admin');
    }
    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as agent
   */
  agentPage: async ({ browser }, use) => {
    const statePath = storageStateFile('agent');
    const context = await browser.newContext({
      storageState: (await storageStateExists(statePath)) ? statePath : undefined,
      locale: 'en-US',
      extraHTTPHeaders: { 'x-forwarded-for': ipForRole('agent') },
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      await performLogin(page, 'agent');
    }
    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as staff
   */
  staffPage: async ({ browser }, use) => {
    const statePath = storageStateFile('staff');
    const context = await browser.newContext({
      storageState: (await storageStateExists(statePath)) ? statePath : undefined,
      locale: 'en-US',
      extraHTTPHeaders: { 'x-forwarded-for': ipForRole('staff') },
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      await performLogin(page, 'staff');
    }
    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as a branch manager
   */
  branchManagerPage: async ({ browser }, use) => {
    const statePath = storageStateFile('branch_manager');
    const context = await browser.newContext({
      storageState: (await storageStateExists(statePath)) ? statePath : undefined,
      locale: 'en-US',
      extraHTTPHeaders: {
        'x-forwarded-for': '10.0.0.15', // Distinct IP for BM
      },
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      await performLogin(page, 'branch_manager');
    }
    await use(page);
    await context.close();
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// RE-EXPORT EXPECT
// ═══════════════════════════════════════════════════════════════════════════════

export { expect } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function storageStateFile(role: Role): string {
  return path.join(__dirname, '.auth', `${role}.json`);
}

async function storageStateExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasSessionCookie(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies();
  return cookies.some(c => /session|auth|better-auth/i.test(c.name));
}

/**
 * Check if user is logged in by looking for auth indicators.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  for (const selector of AUTH_OK_SELECTORS) {
    const isVisible = await page
      .locator(selector)
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (isVisible) return true;
  }
  return await hasSessionCookie(page);
}

async function openAuthMenu(page: Page): Promise<void> {
  for (const selector of AUTH_OK_SELECTORS) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return;
    }
  }
}

/**
 * Perform logout.
 */
export async function logout(page: Page): Promise<void> {
  await openAuthMenu(page);
  await page.click('text=Logout, text=Sign out, [data-testid="logout"]');
  await page.waitForURL(LOGIN_RX, { timeout: 15_000 });
}
