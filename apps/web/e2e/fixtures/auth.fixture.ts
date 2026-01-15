/**
 * Authentication Fixture for Playwright E2E Tests
 *
 * Provides authenticated page contexts for testing protected routes.
 * Features:
 * - Deterministic API-based login (fast & reliable)
 * - Locale-aware URL matching
 * - Verification via session cookie
 * - StorageState helpers for faster test runs
 */

import { test as base, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { routes } from '../routes';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Locators that only appear when logged in
const AUTH_OK_SELECTORS = ['[data-testid="user-nav"]', '[data-testid="sidebar-user-menu-button"]'];

function getBaseURL(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://127.0.0.1:3000';
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST USER CREDENTIALS
// ═══════════════════════════════════════════════════════════════════════════════

type Role = 'member' | 'admin' | 'agent' | 'staff' | 'branch_manager' | 'admin_mk';

function ipForRole(role: Role): string {
  // Stable IPs for each role to avoid unexpected rate limiting collision if checking by IP
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
    email: 'ks.member.pack.1@interdomestik.com',
    password: 'GoldenPass123!',
    name: 'Test Member KS Pack',
  },
  admin: {
    email: 'admin@interdomestik.com',
    password: 'AdminPassword123!',
    name: 'Admin KS (E2E)',
  },
  agent: {
    email: 'agent.ks.a1@interdomestik.com',
    password: 'GoldenPass123!',
    name: 'Agent KS',
  },
  staff: {
    email: 'staff.ks.extra@interdomestik.com',
    password: 'GoldenPass123!',
    name: 'Staff KS Extra',
  },
  branch_manager: {
    email: 'bm.mk.a@interdomestik.com',
    password: 'GoldenPass123!',
    name: 'Branch Manager MK',
  },
  admin_mk: {
    email: 'admin.mk@interdomestik.com',
    password: 'GoldenPass123!',
    name: 'Admin MK (E2E Scan)',
  },
};

export const TEST_USER = CREDS.member;
export const TEST_ADMIN = CREDS.admin;
export const TEST_AGENT = CREDS.agent;
export const TEST_STAFF = CREDS.staff;
export const TEST_BM = CREDS.branch_manager;
export const TEST_ADMIN_MK = CREDS.admin_mk;

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function performLogin(page: Page, role: Role): Promise<void> {
  const { email, password } = CREDS[role];
  const baseURL = getBaseURL();

  // API Login Strategy (Robust)
  const res = await page.request.post('/api/auth/sign-in/email', {
    data: { email, password },
    headers: {
      Origin: baseURL,
      Referer: `${baseURL}/login`,
      'x-forwarded-for': ipForRole(role),
    },
  });

  if (!res.ok()) {
    throw new Error(`API login failed for ${role}: ${res.status()} ${await res.text()}`);
  }

  // Ensure cookies are set (page.request shares context storage state)
  // Verify by checking cookies
  const cookies = await page.context().cookies();
  const hasSessionToken = cookies.some(c => c.name.includes('session_token'));

  if (!hasSessionToken) {
    console.warn(`WARNING: No session_token cookie found after successful API login for ${role}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

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
      await performLogin(page, role);
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
      baseURL: getBaseURL(),
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      console.log('Admin state missing or invalid, performing fresh login...');
      await performLogin(page, 'admin');
      // Update state file for next time? Ideally setup does this.
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
      baseURL: getBaseURL(),
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
      baseURL: getBaseURL(),
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
      baseURL: getBaseURL(),
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
  return path.join(__dirname, '..', '.auth', `${role}.json`);
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

export async function logout(page: Page): Promise<void> {
  const baseURL = getBaseURL();
  await page.request.post('/api/auth/sign-out', {
    headers: { Origin: baseURL },
  });
  await page.goto(routes.login('en'));
}
