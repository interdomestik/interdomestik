import {
  account,
  db,
  E2E_PASSWORD,
  E2E_USER_IDS,
  E2E_USERS,
  session,
} from '@interdomestik/database';
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import { getProjectUrlInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { isKsGateProject } from './gate-project-identity';

// Revocation ends every other session of the actor, so it must not be a stored-state user.
const ACTOR = 'KS_STAFF_UNASSIGNED' as const;
const STAFF_READY = 'staff-page-ready';
const LOGIN_READY = 'auth-ready';
const NOT_FOUND = 'not-found-page';
const RENDER_ERROR = 'Something went wrong!';
const ROTATED_PASSWORD = `${E2E_PASSWORD}-rotated`;
const INVALID_CREDENTIALS = 'INVALID_EMAIL_OR_PASSWORD';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

test.use({ storageState: { cookies: [], origins: [] } });
// Serial: every test revokes sessions of the same actor.
test.describe.configure({ mode: 'serial' });

function originOf(info: TestInfo): string {
  return getProjectUrlInfo(info, null).origin;
}

async function newDevice(browser: Browser, info: TestInfo, storageState?: StorageState) {
  return browser.newContext({
    baseURL: info.project.use.baseURL,
    extraHTTPHeaders: info.project.use.extraHTTPHeaders,
    ...(storageState && { storageState }),
  });
}

async function postAuth(request: APIRequestContext, info: TestInfo, path: string, data: object) {
  const origin = originOf(info);
  return request.post(`${origin}/api/auth/${path}`, {
    data,
    headers: { Origin: origin, ...info.project.use.extraHTTPHeaders },
  });
}

async function signIn(
  context: BrowserContext,
  info: TestInfo,
  ip: string,
  password = E2E_PASSWORD
) {
  const origin = originOf(info);
  return context.request.post(`${origin}/api/auth/sign-in/email`, {
    data: { email: E2E_USERS[ACTOR].email, password },
    headers: { Origin: origin, 'x-forwarded-for': ip, ...info.project.use.extraHTTPHeaders },
  });
}

async function signInOrFail(context: BrowserContext, info: TestInfo, ip: string): Promise<string> {
  const login = await signIn(context, info, ip);
  expect(login.ok()).toBeTruthy();
  expect((await login.json()).user.id).toBe(E2E_USER_IDS[ACTOR]);
  return sessionToken(context);
}

/** The cookie holds `<token>.<signature>`; the session row is keyed by the bare token. */
async function sessionToken(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find(c => c.name.endsWith('session_token'));
  expect(cookie, 'session cookie').toBeDefined();
  return decodeURIComponent(cookie!.value).split('.')[0];
}

async function sessionRowExists(token: string): Promise<boolean> {
  const row = await db.query.session.findFirst({
    where: eq(session.token, token),
    columns: { id: true },
  });
  return row !== undefined;
}

const credentialAccount = and(
  eq(account.userId, E2E_USER_IDS[ACTOR]),
  eq(account.providerId, 'credential')
);

async function credentialHash(): Promise<string> {
  const row = await db.query.account.findFirst({
    where: credentialAccount,
    columns: { password: true },
  });
  expect(row?.password, 'seeded credential hash').toBeTruthy();
  return row!.password!;
}

/** Restores the seeded hash directly, so recovery does not depend on the session under test. */
async function restoreCredentialHash(hash: string): Promise<void> {
  await db.update(account).set({ password: hash }).where(credentialAccount);
}

async function currentUserId(request: APIRequestContext, info: TestInfo) {
  const response = await request.get(`${originOf(info)}/api/auth/get-session`);
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return body?.user?.id ?? null;
}

async function expectStaffPortal(page: Page, info: TestInfo) {
  await gotoApp(page, routes.staffClaims(info), info, { marker: STAFF_READY });
  await expect(page.getByTestId(LOGIN_READY)).toHaveCount(0);
}

/**
 * Replays captured cookies in two fresh contexts. A rejected get-session clears the cookie in its
 * own context, so the portal check needs a context that still carries the revoked cookie.
 *
 * Either layer may deny it: the proxy redirects an inactive session to the login wall, but trusts a
 * session it saw active in the last 2 s (proxy-session-state.ts), and the staff layout then denies
 * the revoked session with the not-found page.
 */
async function expectReplayRejected(browser: Browser, info: TestInfo, captured: StorageState) {
  const api = await newDevice(browser, info, captured);
  const portal = await newDevice(browser, info, captured);
  try {
    expect(await currentUserId(api.request, info)).toBeNull();
    const page = await portal.newPage();
    await gotoApp(page, routes.staffClaims(info), info);
    const denial = page.locator(`[data-testid="${LOGIN_READY}"], [data-testid="${NOT_FOUND}"]`);
    await expect(denial.first()).toBeVisible({ timeout: 15_000 });
    // The locale error boundary reuses the not-found marker; a render failure is not a denial.
    await expect(page.getByTestId(NOT_FOUND).filter({ hasText: RENDER_ERROR })).toHaveCount(0);
    await expect(page.getByTestId(STAFF_READY)).toHaveCount(0);
  } finally {
    await api.close();
    await portal.close();
  }
}

function requireKsHost(info: TestInfo) {
  test.skip(!isKsGateProject(info.project.name), 'Actor is seeded on the KS host');
  test.setTimeout(90_000);
}

test.describe('session revocation', () => {
  test('a signed-out session cannot be replayed', async ({ browser, page }, info) => {
    requireKsHost(info);
    const token = await signInOrFail(page.context(), info, '10.0.71.1');
    const captured = await page.context().storageState();
    await expectStaffPortal(page, info);
    expect(await sessionRowExists(token)).toBe(true);

    expect((await postAuth(page.request, info, 'sign-out', {})).ok()).toBeTruthy();
    expect(await sessionRowExists(token)).toBe(false);
    await expectReplayRejected(browser, info, captured);
  });

  test('revoking other sessions ends them and keeps the current one', async ({
    browser,
    page,
  }, info) => {
    requireKsHost(info);
    const current = await signInOrFail(page.context(), info, '10.0.71.2');
    const other = await newDevice(browser, info);
    try {
      const otherToken = await signInOrFail(other, info, '10.0.71.3');
      expect(otherToken).not.toBe(current);
      await expectStaffPortal(await other.newPage(), info);
      const otherCaptured = await other.storageState();

      const revoke = await postAuth(page.request, info, 'revoke-other-sessions', {});
      expect(revoke.ok()).toBeTruthy();

      expect(await sessionRowExists(otherToken)).toBe(false);
      await expectReplayRejected(browser, info, otherCaptured);
      expect(await sessionRowExists(current)).toBe(true);
      expect(await currentUserId(page.request, info)).toBe(E2E_USER_IDS[ACTOR]);
      await expectStaffPortal(page, info);
    } finally {
      await other.close();
    }
  });

  test('a password change revokes every prior session and issues a new one', async ({
    browser,
    page,
  }, info) => {
    requireKsHost(info);
    const seededHash = await credentialHash();
    const before = await signInOrFail(page.context(), info, '10.0.71.4');
    const callerCaptured = await page.context().storageState();
    const other = await newDevice(browser, info);
    try {
      const otherToken = await signInOrFail(other, info, '10.0.71.5');
      const otherCaptured = await other.storageState();

      // The same call the account settings form makes.
      const change = await postAuth(page.request, info, 'change-password', {
        currentPassword: E2E_PASSWORD,
        newPassword: ROTATED_PASSWORD,
        revokeOtherSessions: true,
      });
      expect(change.ok()).toBeTruthy();
      expect(await credentialHash()).not.toBe(seededHash);

      expect(await sessionRowExists(otherToken)).toBe(false);
      expect(await sessionRowExists(before)).toBe(false);
      await expectReplayRejected(browser, info, otherCaptured);
      await expectReplayRejected(browser, info, callerCaptured);

      const after = await sessionToken(page.context());
      expect(after).not.toBe(before);
      expect(await sessionRowExists(after)).toBe(true);
      expect(await currentUserId(page.request, info)).toBe(E2E_USER_IDS[ACTOR]);
      await expectStaffPortal(page, info);

      const fresh = await newDevice(browser, info);
      try {
        const stale = await signIn(fresh, info, '10.0.71.6');
        expect(stale.status()).toBe(401);
        expect((await stale.json()).code).toBe(INVALID_CREDENTIALS);
        expect((await signIn(fresh, info, '10.0.71.7', ROTATED_PASSWORD)).ok()).toBeTruthy();
      } finally {
        await fresh.close();
      }
    } finally {
      await other.close();
      // Later specs sign this actor in with the seeded password; restore it whatever failed.
      await restoreCredentialHash(seededHash);
    }
  });
});
