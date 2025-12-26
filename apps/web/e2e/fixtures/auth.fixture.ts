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

import { test as base, expect, Page } from '@playwright/test';
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

// Locator that only appears when logged in
const AUTH_OK_LOCATOR = '[data-testid="user-nav"]';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST USER CREDENTIALS
// ═══════════════════════════════════════════════════════════════════════════════

type Role = 'member' | 'admin' | 'agent' | 'staff';

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
};

// Legacy exports for backward compatibility
export const TEST_USER = CREDS.member;
export const TEST_ADMIN = CREDS.admin;
export const TEST_AGENT = CREDS.agent;
export const TEST_STAFF = CREDS.staff;

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function performLogin(page: Page, role: Role): Promise<void> {
  const { email, password } = CREDS[role];

  // Always start from a clean tab and a consistent URL
  const loginResponse = await page.goto(SIGNIN_PATH, { waitUntil: 'domcontentloaded' });
  if (loginResponse && loginResponse.status() === 404) {
    await page.goto(routes.loginRaw(), { waitUntil: 'domcontentloaded' });
  }

  // Wait for form to be visible
  await page.waitForSelector('form', { state: 'visible', timeout: 10_000 });

  // Fill credentials
  // Wait for network to settle to ensure hydration
  await page.waitForLoadState('networkidle').catch(() => {}); // catch if network never idles
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);

  // Wait for auth API response (if exposed) AND click submit
  const authResponse = page
    .waitForResponse(
      r =>
        /\/api\/auth|\/session|\/login|\/signin/.test(r.url()) &&
        r.request().method() === 'POST' &&
        r.status() < 400
    )
    .catch(() => null); // tolerate apps that don't expose this endpoint

  const [response] = await Promise.all([authResponse, page.click('button[type="submit"]')]);

  if (response && !response.ok()) {
    console.error('❌ Login Failed:', response.status(), await response.text());
  }

  // Prove we are NOT on a login URL anymore (handles locale prefixes)
  await expect(page).not.toHaveURL(LOGIN_RX, { timeout: 15_000 });

  // Final proof of auth: visible user nav OR cookie presence fallback
  try {
    await expect(page.locator(AUTH_OK_LOCATOR)).toBeVisible({ timeout: 5_000 });
  } catch {
    // Fallback: check for a session/auth cookie
    const cookies = await page.context().cookies();
    const hasSession = cookies.some(c => /session|auth|better-auth/i.test(c.name));
    expect(hasSession, 'Expected an auth/session cookie after login').toBeTruthy();

    // Optional fallback: hit a protected page to force auth check
    await page.goto(`/${DEFAULT_LOCALE}/member`, { waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(LOGIN_RX, { timeout: 10_000 });
  }
}

async function hasSessionCookie(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies();
  return cookies.some(c => /session|auth|better-auth/i.test(c.name));
}

async function ensureAuthenticated(page: Page, role: Role): Promise<void> {
  // If the project provides storageState, we should already have cookies.
  // Avoid UI login unless we truly need it.
  if (await hasSessionCookie(page)) return;
  await performLogin(page, role);
}

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

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface AuthFixtures {
  loginAs: (role: Role) => Promise<void>;
  saveState: (role: Role) => Promise<void>;
  authenticatedPage: Page;
  adminPage: Page;
  agentPage: Page;
  staffPage: Page;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENDED TEST WITH AUTH FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

export const test = base.extend<AuthFixtures>({
  /**
   * Helper to login as any role on demand
   */
  loginAs: async ({ page }, use) => {
    await use(async (role: Role) => {
      await ensureAuthenticated(page, role);
    });
  },

  /**
   * Helper to generate storageState files for faster tests
   */
  saveState: async ({ page }, use) => {
    await use(async (role: Role) => {
      await performLogin(page, role);

      // Give the post-login route a chance to finish streaming/hydration.
      // This reduces noisy server logs (aborted/partial JSON) when Playwright
      // snapshots storageState and closes the context shortly after login.
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});

      const out = path.join(__dirname, '.auth', `${role}.json`);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await page.context().storageState({ path: out });
      console.log(`✅ Saved storageState for ${role} to ${out}`);
    });
  },

  /**
   * Page authenticated as a regular member
   */
  authenticatedPage: async ({ browser }, use) => {
    const statePath = storageStateFile('member');
    const context = await browser.newContext({
      storageState: (await storageStateExists(statePath)) ? statePath : undefined,
      locale: 'en-US',
      extraHTTPHeaders: {
        'x-forwarded-for': ipForRole('member'),
      },
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      await performLogin(page, 'member');
    }
    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as an admin
   */
  adminPage: async ({ browser }, use) => {
    const statePath = storageStateFile('admin');
    const context = await browser.newContext({
      storageState: (await storageStateExists(statePath)) ? statePath : undefined,
      locale: 'en-US',
      extraHTTPHeaders: {
        'x-forwarded-for': ipForRole('admin'),
      },
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      await performLogin(page, 'admin');
    }
    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as an agent
   */
  agentPage: async ({ browser }, use) => {
    const statePath = storageStateFile('agent');
    const context = await browser.newContext({
      storageState: (await storageStateExists(statePath)) ? statePath : undefined,
      locale: 'en-US',
      extraHTTPHeaders: {
        'x-forwarded-for': ipForRole('agent'),
      },
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      await performLogin(page, 'agent');
    }
    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as a staff member
   */
  staffPage: async ({ browser }, use) => {
    const statePath = storageStateFile('staff');
    const context = await browser.newContext({
      storageState: (await storageStateExists(statePath)) ? statePath : undefined,
      locale: 'en-US',
      extraHTTPHeaders: {
        'x-forwarded-for': ipForRole('staff'),
      },
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      await performLogin(page, 'staff');
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

/**
 * Check if user is logged in by looking for auth indicators.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    const userNav = page.locator(AUTH_OK_LOCATOR);
    return await userNav.isVisible({ timeout: 2_000 });
  } catch {
    return false;
  }
}

/**
 * Perform logout.
 */
export async function logout(page: Page): Promise<void> {
  await page.click(AUTH_OK_LOCATOR);
  await page.click('text=Logout, text=Sign out, [data-testid="logout"]');
  await page.waitForURL(LOGIN_RX, { timeout: 15_000 });
}
