import { expect, type Page, type TestInfo } from '@playwright/test';
import { gotoApp } from '../utils/navigation';
import {
  buildUiLoginUrl,
  credsFor,
  getApiOrigin,
  getAuthOrigin,
  getProjectUrlInfo,
  ipForRole,
  type ProjectUrlInfo,
  type Role,
  type Tenant,
} from './auth.project';
import { getCanonicalRouteForRole } from '../../src/lib/canonical-routes';
import { emitAuthTelemetryEvent } from '../../src/lib/auth-telemetry';
import { assertNoTenantChooser } from './e2e.diagnostics';

export type PostAuthProbeMode = 'bootstrap' | 'validate';

export { normalizeAuthPathnameFamily as normalizePathnameFamily } from '../../src/lib/auth-telemetry';

function getTelemetrySurface(role: Role): 'staff' | 'member' | 'admin' | 'agent' | 'unknown' {
  if (role === 'staff') return 'staff';
  if (role === 'admin' || role === 'branch_manager' || role === 'admin_mk') return 'admin';
  if (role === 'agent') return 'agent';
  if (role === 'member' || role === 'member_empty') return 'member';
  return 'unknown';
}

export function emitSessionProbeSkippedAfterReadyTelemetry(params: {
  tenant: Tenant;
  locale: string;
  role: Role;
  origin: string;
  pathname: string;
}): void {
  emitAuthTelemetryEvent({
    eventName: 'session_probe_skipped_after_ready',
    tenant: params.tenant,
    locale: params.locale,
    surface: getTelemetrySurface(params.role),
    host: new URL(params.origin).host,
    pathname: params.pathname,
    reason: 'ready_probe_skipped',
  });
}

export function resolvePostAuthProbePlan(params: {
  readyMarkersVisible: boolean;
  probeMode?: PostAuthProbeMode;
}): { shouldProbe: boolean; shouldEmitSkipTelemetry: boolean } {
  if (!params.readyMarkersVisible) {
    return { shouldProbe: true, shouldEmitSkipTelemetry: false };
  }

  if (params.probeMode === 'validate') {
    return { shouldProbe: true, shouldEmitSkipTelemetry: false };
  }

  return { shouldProbe: false, shouldEmitSkipTelemetry: true };
}

export function assertPostAuthSessionProbeStatus(status: number, role: Role): void {
  expect(status, `Session should remain authenticated after ensuring auth for ${role}`).toBe(200);
}

export async function performLogin(
  page: Page,
  role: Role,
  info: ProjectUrlInfo,
  testInfo: TestInfo,
  tenant: Tenant = 'ks'
): Promise<void> {
  const { email, password } = credsFor(role, tenant);

  // API Login Strategy (Robust)
  const apiBase = getApiOrigin(info.baseURL);
  const loginURL = `${apiBase}/api/auth/sign-in/email`;
  const res = await page.request.post(loginURL, {
    data: { email, password },
    headers: {
      // Force Origin to match BETTER_AUTH_URL to pass trusted origin check
      // when using IP-based auth server.
      Origin: getAuthOrigin(),
      Referer: buildUiLoginUrl(info),
      'x-forwarded-for': ipForRole(role),
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

  const expectedHost = new URL(info.origin).hostname;
  const hasCookieForHost = sessionCookies.some(
    c => c.domain === expectedHost || c.domain === `.${expectedHost}`
  );

  if (sessionCookies.length === 0) {
    console.warn(`❌ No session_token cookie found after successful API login for ${role}`);
  } else {
    console.log(`✅ Session cookies found for ${role}`);
    if (!hasCookieForHost) {
      console.warn(`⚠️ Session cookie domain mismatch for ${role}. Expected host ${expectedHost}.`);
    }
  }

  // Deterministic post-login navigation
  const roleForRoute = role === 'admin_mk' ? 'admin' : role;
  const targetPath = getCanonicalRouteForRole(roleForRoute, info.locale) ?? '/member';

  await gotoApp(page, targetPath, testInfo, {
    marker: 'dashboard-page-ready',
  });
  await assertNoTenantChooser(page);
}

export async function ensureAuthenticated(
  page: Page,
  testInfo: TestInfo,
  role: Role,
  tenant: Tenant,
  probeMode: PostAuthProbeMode = 'bootstrap'
) {
  const info = getProjectUrlInfo(testInfo, null);
  // Determine target based on role
  const roleForRoute = role === 'admin_mk' ? 'admin' : role;
  const targetPath = getCanonicalRouteForRole(roleForRoute, info.locale) ?? '/member';

  console.log(
    `[Auth] Ensuring auth for ${role} on ${tenant} -> ${targetPath} (Step 1: Nav to Body)`
  );
  // Navigate using gotoApp (handles locale). Use a permissive marker first so
  // we can detect auth redirects (e.g., bounced to /login).
  await gotoApp(page, targetPath, testInfo, { marker: 'body' });

  // Check if we bounced to login (login page uses auth-ready)
  const isLoginPage = await page
    .getByTestId('auth-ready')
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (isLoginPage) {
    console.log(`[Auth] Session invalid/missing for ${role}, re-logging in...`);
    await performLogin(page, role, info, testInfo, tenant);
  }

  console.log(`[Auth] Step 2: Verifying ready marker at ${targetPath}`);
  // Ensure we're on the intended role landing page.
  await gotoApp(page, targetPath, testInfo, {
    marker: 'dashboard-page-ready',
  });

  const probePlan = resolvePostAuthProbePlan({
    readyMarkersVisible: true,
    probeMode,
  });

  if (!probePlan.shouldProbe) {
    emitSessionProbeSkippedAfterReadyTelemetry({
      tenant,
      locale: info.locale,
      role,
      origin: info.origin,
      pathname: targetPath,
    });
    return;
  }

  // Phase 3: Post-ensure validation (Contract guarantee)
  const apiBase = getApiOrigin(testInfo.project.use.baseURL!);
  const sessionRes = await page.request.get(`${apiBase}/api/auth/get-session`);

  if (sessionRes.status() !== 200) {
    console.error(`[Auth] Session check failed: ${sessionRes.status()} ${await sessionRes.text()}`);
  }
  assertPostAuthSessionProbeStatus(sessionRes.status(), role);

  const currentUrl = page.url();
  console.log(`[Auth] Success. Current URL: ${currentUrl}`);
  expect(
    currentUrl,
    `Should not be on login page after ensureAuthenticated (URL: ${currentUrl})`
  ).not.toContain('/login');
}
