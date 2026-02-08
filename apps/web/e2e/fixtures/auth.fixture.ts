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
import { test as base, expect, Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { routes } from '../routes';
import { getCanonicalRouteForRole } from '../../src/lib/canonical-routes';
import { gotoApp } from '../utils/navigation';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Locators that only appear when logged in
const AUTH_OK_SELECTORS = ['[data-testid="user-nav"]', '[data-testid="sidebar-user-menu-button"]'];

type ProjectUrlInfo = {
  baseURL: string;
  origin: string;
  locale: string;
};

type GlobalE2E = typeof globalThis & {
  __E2E_BASE_URL?: string;
};

type Tenant = 'ks' | 'mk' | 'pilot';

type Role = 'member' | 'member_empty' | 'admin' | 'agent' | 'staff' | 'branch_manager' | 'admin_mk';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (Pure / Utils)
// ═══════════════════════════════════════════════════════════════════════════════

function getProjectUrlInfo(testInfo: TestInfo, baseURLFromFixture?: string | null): ProjectUrlInfo {
  const baseURL = (testInfo.project.use.baseURL ?? baseURLFromFixture)?.toString();
  if (!baseURL) {
    throw new Error(
      'Playwright baseURL is required for auth fixtures. Set project.use.baseURL in playwright.config.ts.'
    );
  }

  const url = new URL(baseURL);
  const firstSegment = url.pathname.split('/').find(Boolean) ?? 'en';
  const locale = /^(sq|mk|en)$/i.test(firstSegment) ? firstSegment.toLowerCase() : 'en';

  return {
    baseURL,
    origin: url.origin,
    locale,
  };
}

function setWorkerE2EBaseURL(info: ProjectUrlInfo): void {
  // Each Playwright worker runs a single project; stash baseURL so e2e/routes.ts
  // can derive the correct default locale per worker (no cross-project leakage).
  (globalThis as GlobalE2E).__E2E_BASE_URL = info.baseURL;
}

function buildUiLoginUrl(info: ProjectUrlInfo): string {
  return `${info.origin}/${info.locale}/login`;
}

async function assertNoTenantChooser(page: Page): Promise<void> {
  await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);
}

function attachDialogDiagnostics(page: Page): void {
  page.on('dialog', async dialog => {
    const type = dialog.type();
    const message = dialog.message();
    console.warn(`[E2E Dialog] type=${type} message=${JSON.stringify(message)}`);
    try {
      await dialog.dismiss();
    } catch {
      // Ignore dialog dismissal errors (best-effort).
    }
  });

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log(`[E2E Nav] ${frame.url()}`);
    }
  });

  page.on('requestfailed', request => {
    if (request.resourceType() !== 'document') return;
    const failure = request.failure();
    console.warn(
      `[E2E RequestFailed] ${request.method()} ${request.url()} ${failure?.errorText ?? ''}`
    );
  });

  page.on('response', response => {
    const req = response.request();
    if (req.resourceType() !== 'document') return;
    const url = response.url();
    if (!/\/admin\/branches|\/login/i.test(url)) return;
    console.log(`[E2E DocResponse] ${response.status()} ${url}`);
  });
}

function getTenantFromTestInfo(testInfo: TestInfo): Tenant {
  const name = testInfo.project.name;
  if (name.includes('pilot')) return 'pilot';
  if (name.includes('mk')) return 'mk';
  return 'ks';
}

function ipForRole(role: Role): string {
  // Stable IPs for each role to avoid unexpected rate limiting collision if checking by IP
  switch (role) {
    case 'member':
    case 'member_empty':
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

  if (tenant === 'pilot') {
    switch (role) {
      case 'admin':
        return E2E_USERS.PILOT_MK_ADMIN;
      case 'agent':
        return E2E_USERS.PILOT_MK_AGENT;
      default:
        throw new Error(`Role ${role} not implemented for pilot tenant`);
    }
  }

  if (tenant === 'mk') {
    switch (role) {
      case 'member':
      case 'member_empty':
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
    case 'member_empty':
      return E2E_USERS.KS_MEMBER_EMPTY;
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

function storageStateFile(role: Role, tenant: Tenant): string {
  // Keep legacy `admin_mk` file name for backwards-compat with existing state files.
  const filename = role === 'admin_mk' ? 'admin' : role;
  return path.join(__dirname, '..', '.auth', tenant, `${filename}.json`);
}

async function storageStateUsable(filePath: string, expectedHost: string): Promise<boolean> {
  try {
    await fs.access(filePath);
  } catch {
    return false;
  }

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { cookies?: Array<{ name?: string; domain?: string }> };
    const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : [];
    const sessionCookies = cookies.filter(c => (c.name ?? '').includes('session_token'));

    if (sessionCookies.length === 0) return false;

    return sessionCookies.some(c => {
      const domain = (c.domain ?? '').toLowerCase();
      const host = expectedHost.toLowerCase();
      return domain === host || domain === `.${host}`;
    });
  } catch {
    // If parsing fails, treat as unusable so it can be regenerated.
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

export async function logout(page: Page, testInfo: TestInfo): Promise<void> {
  const info = getProjectUrlInfo(testInfo, null);
  const projectHeaders = testInfo.project.use.extraHTTPHeaders || {};
  await page.request.post(new URL('/api/auth/sign-out', info.origin).toString(), {
    headers: {
      Origin: info.origin,
      ...projectHeaders,
    },
  });
  await gotoApp(page, routes.login('en'), testInfo);
}

// Backwards-compatible exports (default to KS).
export const TEST_USER = credsFor('member', 'ks');
export const TEST_ADMIN = credsFor('admin', 'ks');
export const TEST_AGENT = credsFor('agent', 'ks');
export const TEST_STAFF = credsFor('staff', 'ks');
export const TEST_BM = credsFor('branch_manager', 'mk');
export const TEST_ADMIN_MK = credsFor('admin', 'mk');

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN & AUTH LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

async function performLogin(
  page: Page,
  role: Role,
  info: ProjectUrlInfo,
  testInfo: TestInfo,
  tenant: Tenant = 'ks'
): Promise<void> {
  const { email, password } = credsFor(role, tenant);

  // API Login Strategy (Robust)
  // IMPORTANT: login MUST use the same origin as the browser project baseURL.
  // Otherwise session cookies are stored for a different host and won't be sent
  // on subsequent navigation (causing /login redirect cascades).
  const loginURL = new URL('/api/auth/sign-in/email', info.origin).toString();

  // Propagate tenant simulation headers (x-forwarded-host) from project config.
  const projectHeaders = testInfo.project.use.extraHTTPHeaders || {};

  const res = await page.request.post(loginURL, {
    data: { email, password },
    headers: {
      Origin: info.origin,
      Referer: buildUiLoginUrl(info),
      'x-forwarded-for': ipForRole(role),
      ...projectHeaders,
    },
  });

  if (res.ok()) {
    console.log(`✅ API login matched for ${role} (${email})`);
  } else {
    const text = await res.text();
    console.error(`❌ API login failed for ${role}: ${res.status()} ${res.url()} ${text}`);
    throw new Error(`API login failed for ${role}: ${res.status()} ${res.url()} ${text}`);
  }

  // Ensure cookies are set
  const cookies = await page.context().cookies();
  const sessionCookies = cookies.filter(c => c.name.includes('session_token'));

  // We expect cookies to be set for the forwarded host (e.g. mk.127.0.0.1.nip.io) OR 127.0.0.1
  // But typically Better Auth will set them for the host it thinks it is.
  // With x-forwarded-host, it should respect that.

  if (sessionCookies.length === 0) {
    console.warn(`❌ No session_token cookie found after successful API login for ${role}`);
    console.log('All cookies:', JSON.stringify(cookies, null, 2));
  } else {
    console.log(`✅ Session cookies found for ${role}:`);
    console.log(JSON.stringify(sessionCookies, null, 2));
  }

  // Deterministic post-login navigation
  const roleForRoute = role === 'admin_mk' ? 'admin' : role;
  const targetPath =
    getCanonicalRouteForRole(roleForRoute, info.locale) ?? `/${info.locale}/member`;

  // Use testInfo-derived base URL (should be 127.0.0.1)
  const targetUrl = new URL(targetPath, info.baseURL).toString();
  await gotoApp(page, targetUrl, testInfo, { marker: 'domcontentloaded' });
  const marker = 'dashboard-page-ready';

  try {
    await expect(page.getByTestId(marker)).toBeVisible({ timeout: 30000 });
  } catch (e) {
    console.error(`[Auth Diagnostics] Marker "${marker}" NOT FOUND for ${role}`);
    console.error(`[Auth Diagnostics] Current URL: ${page.url()}`);
    const html = await page.content();
    console.error(`[Auth Diagnostics] Page HTML preview (first 500 chars): ${html.slice(0, 500)}`);
    throw e;
  }

  await assertNoTenantChooser(page);

  // Diagnostics
  const currentUrl = page.url();
  const currentPath = new URL(currentUrl).pathname;
  if (currentPath === `/${info.locale}/login`) {
    // ... diag logic ...
    console.error('[Auth Diagnostics] Still on login after API auth');
  }
}

async function ensureAuthenticated(page: Page, testInfo: TestInfo, role: Role, tenant: Tenant) {
  // Phase 0: Debug Config
  const info = getProjectUrlInfo(testInfo, null);
  const debugRes = await page.request.get(new URL('/api/_debug/auth', info.origin).toString());
  if (debugRes.ok()) {
    const debugData = await debugRes.json();
    console.log('[E2E Debug] Auth Config:', JSON.stringify(debugData, null, 2));
  }

  // Determine target based on role
  const roleForRoute = role === 'admin_mk' ? 'admin' : role;
  const targetPath = getCanonicalRouteForRole(roleForRoute, info.locale) ?? '/member';

  // Navigate using gotoApp (handles locale)
  await gotoApp(page, targetPath, testInfo, { marker: 'body' });

  // Check if we bounced to login (auth-ready or registration-page-ready visible OR url contains /login)
  // We purposefully include a URL check for speed/robustness on slow renderers.
  const isLoginPage =
    (await Promise.race([
      page
        .getByTestId('auth-ready')
        .waitFor({ timeout: 3000 })
        .then(() => true)
        .catch(() => false),
      page
        .getByTestId('registration-page-ready')
        .waitFor({ timeout: 3000 })
        .then(() => true)
        .catch(() => false),
      page
        .getByTestId('dashboard-page-ready')
        .waitFor({ timeout: 3000 })
        .then(() => false)
        .catch(() => false),
    ])) || page.url().includes('/login');

  if (isLoginPage) {
    console.log(`[Auth] Session invalid/missing for ${role}, re-logging in...`);
    const info = getProjectUrlInfo(testInfo, null);
    await performLogin(page, role, info, testInfo, tenant);
  }

  // Final check with strict marker
  // Final check with strict marker
  const marker = 'dashboard-page-ready';
  await gotoApp(page, targetPath, testInfo, { marker });
  // Phase 3: Post-ensure validation (Contract guarantee)
  const sessionUrl = new URL('/api/auth/get-session', info.origin).toString();
  const projectHeaders = testInfo.project.use.extraHTTPHeaders || {};
  const sessionRes = await page.request.get(sessionUrl, {
    headers: {
      Origin: info.origin,
      ...projectHeaders,
    },
  });
  expect(
    sessionRes.status(),
    `Session should be valid (200 OK) after ensuring auth for ${role}`
  ).toBe(200);

  const currentUrl = page.url();
  expect(
    currentUrl,
    `Should not be on login page after ensureAuthenticated (URL: ${currentUrl})`
  ).not.toContain('/login');
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURES (test.extend)
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
      attachDialogDiagnostics(page);
      const tenant = getTenantFromTestInfo(testInfo);
      const info = getProjectUrlInfo(testInfo, baseURL);
      setWorkerE2EBaseURL(info);
      await performLogin(page, role, info, testInfo, tenant);
    });
  },

  saveState: async ({ page, baseURL }, use, testInfo) => {
    await use(async (role: Role) => {
      attachDialogDiagnostics(page);
      const tenant = getTenantFromTestInfo(testInfo);
      const statePath = storageStateFile(role, tenant);
      const info = getProjectUrlInfo(testInfo, baseURL);
      setWorkerE2EBaseURL(info);
      await performLogin(page, role, info, testInfo, tenant);
      await page.context().storageState({ path: statePath });
    });
  },

  /**
   * Generic authenticated page (defaults to member if not specified)
   */
  authenticatedPage: async ({ page, baseURL: _baseURL }, use, testInfo) => {
    attachDialogDiagnostics(page);
    const tenant = getTenantFromTestInfo(testInfo);
    await ensureAuthenticated(page, testInfo, 'member', tenant);
    await use(page);
  },

  /**
   * Helper to merge project headers with role specifics
   */
  adminPage: async ({ browser, baseURL }, use, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo);
    const info = getProjectUrlInfo(testInfo, baseURL);
    setWorkerE2EBaseURL(info);
    const statePath = storageStateFile('admin', tenant);

    const projectHeaders = testInfo.project.use.extraHTTPHeaders || {};
    const mergedHeaders = {
      ...projectHeaders,
      'x-forwarded-for': ipForRole('admin'),
    };

    if (process.env.CI) {
      console.log(`[CI Diag] Creating adminPage context with headers:`, mergedHeaders);
    }

    const context = await browser.newContext({
      storageState: (await storageStateUsable(statePath, new URL(info.origin).hostname))
        ? statePath
        : undefined,
      locale: 'en-US',
      extraHTTPHeaders: mergedHeaders,
      baseURL: info.baseURL,
    });
    const page = await context.newPage();
    attachDialogDiagnostics(page);

    await ensureAuthenticated(page, testInfo, 'admin', tenant);

    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as agent
   */
  agentPage: async ({ browser }, use, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo);
    const info = getProjectUrlInfo(testInfo, null);
    setWorkerE2EBaseURL(info);
    const statePath = storageStateFile('agent', tenant);
    const projectHeaders = testInfo.project.use.extraHTTPHeaders || {};
    const mergedHeaders = {
      ...projectHeaders,
      'x-forwarded-for': ipForRole('agent'),
    };

    if (process.env.CI) {
      console.log(`[CI Diag] Creating agentPage context with headers:`, mergedHeaders);
    }

    const context = await browser.newContext({
      storageState: (await storageStateUsable(statePath, new URL(info.origin).hostname))
        ? statePath
        : undefined,
      locale: 'en-US',
      extraHTTPHeaders: mergedHeaders,
      baseURL: info.baseURL,
    });
    const page = await context.newPage();
    attachDialogDiagnostics(page);

    await ensureAuthenticated(page, testInfo, 'agent', tenant);

    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as staff
   */
  staffPage: async ({ browser }, use, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo);
    const info = getProjectUrlInfo(testInfo, null);
    setWorkerE2EBaseURL(info);
    const statePath = storageStateFile('staff', tenant);
    const projectHeaders = testInfo.project.use.extraHTTPHeaders || {};
    const mergedHeaders = {
      ...projectHeaders,
      'x-forwarded-for': ipForRole('staff'),
    };

    if (process.env.CI) {
      console.log(`[CI Diag] Creating staffPage context with headers:`, mergedHeaders);
    }

    const context = await browser.newContext({
      storageState: (await storageStateUsable(statePath, new URL(info.origin).hostname))
        ? statePath
        : undefined,
      locale: 'en-US',
      extraHTTPHeaders: mergedHeaders,
      baseURL: info.baseURL,
    });
    const page = await context.newPage();
    attachDialogDiagnostics(page);

    await ensureAuthenticated(page, testInfo, 'staff', tenant);

    await use(page);
    await context.close();
  },

  /**
   * Page authenticated as a branch manager
   */
  branchManagerPage: async ({ browser }, use, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo);
    const info = getProjectUrlInfo(testInfo, null);
    setWorkerE2EBaseURL(info);
    const statePath = storageStateFile('branch_manager', tenant);
    const projectHeaders = testInfo.project.use.extraHTTPHeaders || {};
    const mergedHeaders = {
      ...projectHeaders,
      // distinct IP for BM
      'x-forwarded-for': '10.0.0.15',
    };

    if (process.env.CI) {
      console.log(`[CI Diag] Creating branchManagerPage context with headers:`, mergedHeaders);
    }

    const context = await browser.newContext({
      storageState: (await storageStateUsable(statePath, new URL(info.origin).hostname))
        ? statePath
        : undefined,
      locale: 'en-US',
      extraHTTPHeaders: mergedHeaders,
      baseURL: info.baseURL,
    });
    const page = await context.newPage();
    attachDialogDiagnostics(page);

    await ensureAuthenticated(page, testInfo, 'branch_manager', tenant);

    await use(page);
    await context.close();
  },
});

// Re-export expect
export { expect } from '@playwright/test';
