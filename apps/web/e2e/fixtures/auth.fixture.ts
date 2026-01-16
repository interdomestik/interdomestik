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

import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { test as base, Page, type TestInfo } from '@playwright/test';
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

type Tenant = 'ks' | 'mk';

type Role = 'member' | 'admin' | 'agent' | 'staff' | 'branch_manager' | 'admin_mk';

function getTenantFromTestInfo(testInfo: TestInfo): Tenant {
  const name = testInfo.project.name;
  if (name.includes('mk')) return 'mk';
  return 'ks';
}

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

function getUserForTenant(role: Role, tenant: Tenant) {
  // Keep `admin_mk` as a legacy alias for MK admin.
  if (role === 'admin_mk') return E2E_USERS.MK_ADMIN;

  // Branch manager per tenant
  if (role === 'branch_manager') {
    return tenant === 'mk' ? E2E_USERS.MK_BRANCH_MANAGER : E2E_USERS.KS_BRANCH_MANAGER;
  }

  if (tenant === 'mk') {
    switch (role) {
      case 'member':
        return E2E_USERS.MK_MEMBER;
      case 'admin':
        return E2E_USERS.MK_ADMIN;
      case 'agent':
        return E2E_USERS.MK_AGENT;
      case 'staff':
        return E2E_USERS.MK_STAFF;
    }
  }

  switch (role) {
    case 'member':
      return E2E_USERS.KS_MEMBER;
    case 'admin':
      return E2E_USERS.KS_ADMIN;
    case 'agent':
      return E2E_USERS.KS_AGENT;
    case 'staff':
      return E2E_USERS.KS_STAFF;
    default:
      return E2E_USERS.KS_MEMBER;
  }
}

function credsFor(role: Role, tenant: Tenant): { email: string; password: string; name: string } {
  const u = getUserForTenant(role, tenant);
  return { email: u.email, password: E2E_PASSWORD, name: u.name };
}

// Backwards-compatible exports (default to KS).
export const TEST_USER = credsFor('member', 'ks');
export const TEST_ADMIN = credsFor('admin', 'ks');
export const TEST_AGENT = credsFor('agent', 'ks');
export const TEST_STAFF = credsFor('staff', 'ks');
export const TEST_BM = credsFor('branch_manager', 'mk');
export const TEST_ADMIN_MK = credsFor('admin', 'mk');

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function performLogin(
  page: Page,
  role: Role,
  authorizedBaseURL?: string | null,
  tenant: Tenant = 'ks'
): Promise<void> {
  const { email, password } = credsFor(role, tenant);
  const baseURL = authorizedBaseURL ?? getBaseURL();

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
    const text = await res.text();
    console.error(`❌ API login failed for ${role}: ${res.status()} ${text}`);
    throw new Error(`API login failed for ${role}: ${res.status()} ${text}`);
  } else {
    console.log(`✅ API login matched for ${role} (${email})`);
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
  loginAs: async ({ page, baseURL }, use, testInfo) => {
    await use(async (role: Role) => {
      const tenant = getTenantFromTestInfo(testInfo);
      // Pass baseURL explicitly if needed, but page.request uses context baseURL
      await performLogin(page, role, baseURL, tenant);

      // Fix for Blocker 2: Always navigate after login to avoid about:blank
      const locale = process.env.PLAYWRIGHT_LOCALE || (tenant === 'mk' ? 'mk' : 'sq');
      let target = `/${locale}`;
      if (role.includes('admin')) target += '/admin';
      else if (role === 'agent') target += '/agent';
      else if (role === 'staff') target += '/staff';
      else target += '/member';

      await page.goto(target, { waitUntil: 'domcontentloaded' });
    });
  },

  saveState: async ({ page }, use, testInfo) => {
    await use(async (role: Role) => {
      const tenant = getTenantFromTestInfo(testInfo);
      const statePath = storageStateFile(role, tenant);
      await performLogin(page, role, undefined, tenant);
      await page.context().storageState({ path: statePath });
    });
  },

  /**
   * Generic authenticated page (defaults to member if not specified)
   */
  authenticatedPage: async ({ page }, use, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo);
    if (!(await isLoggedIn(page))) {
      await performLogin(page, 'member', undefined, tenant);
    }
    await use(page);
  },

  /**
   * Page authenticated as admin
   */
  adminPage: async ({ browser, baseURL }, use, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo);
    const statePath = storageStateFile('admin', tenant);
    const context = await browser.newContext({
      storageState: (await storageStateExists(statePath)) ? statePath : undefined,
      locale: 'en-US',
      extraHTTPHeaders: { 'x-forwarded-for': ipForRole('admin') },
      baseURL: baseURL ?? getBaseURL(),
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      console.log('Admin state missing or invalid, performing fresh login...');
      await performLogin(page, 'admin', baseURL, tenant);
      // Update state file for next time? Ideally setup does this.
    }
    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as agent
   */
  agentPage: async ({ browser }, use, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo);
    const statePath = storageStateFile('agent', tenant);
    const context = await browser.newContext({
      storageState: (await storageStateExists(statePath)) ? statePath : undefined,
      locale: 'en-US',
      extraHTTPHeaders: { 'x-forwarded-for': ipForRole('agent') },
      baseURL: getBaseURL(),
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      await performLogin(page, 'agent', undefined, tenant);
    }
    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as staff
   */
  staffPage: async ({ browser }, use, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo);
    const statePath = storageStateFile('staff', tenant);
    const context = await browser.newContext({
      storageState: (await storageStateExists(statePath)) ? statePath : undefined,
      locale: 'en-US',
      extraHTTPHeaders: { 'x-forwarded-for': ipForRole('staff') },
      baseURL: getBaseURL(),
    });
    const page = await context.newPage();
    if (!(await hasSessionCookie(page))) {
      await performLogin(page, 'staff', undefined, tenant);
    }
    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as a branch manager
   */
  branchManagerPage: async ({ browser }, use, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo);
    const statePath = storageStateFile('branch_manager', tenant);
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
      await performLogin(page, 'branch_manager', undefined, tenant);
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

function storageStateFile(role: Role, tenant: Tenant): string {
  // Keep legacy `admin_mk` file name for backwards-compat with existing state files.
  const filename = role === 'admin_mk' ? 'admin' : role;
  return path.join(__dirname, '..', '.auth', tenant, `${filename}.json`);
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
