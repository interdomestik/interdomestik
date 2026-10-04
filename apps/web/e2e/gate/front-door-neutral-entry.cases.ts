import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { expect, test } from '@playwright/test';

import { gotoApp } from '../utils/navigation';

type ProjectInfo = (baseURL: string | undefined) => { origin: string; locale: string };

export function registerNeutralCredentialEntryCases(projectInfo: ProjectInfo): void {
  const NEUTRAL_LOGIN_CASES = [
    {
      key: 'KS member',
      identity: E2E_USERS.KS_MEMBER,
      surface: 'member',
      marker: 'member-dashboard-ready',
    },
    {
      key: 'MK member',
      identity: E2E_USERS.MK_MEMBER,
      surface: 'member',
      marker: 'member-dashboard-ready',
    },
    {
      key: 'pilot member',
      identity: E2E_USERS.PILOT_MK_MEMBER,
      surface: 'member',
      marker: 'member-dashboard-ready',
    },
    { key: 'agent', identity: E2E_USERS.KS_AGENT, surface: 'agent', marker: 'agent-page-ready' },
    {
      key: 'staff',
      identity: E2E_USERS.KS_STAFF,
      surface: 'staff/claims',
      marker: 'staff-page-ready',
    },
    {
      key: 'admin',
      identity: E2E_USERS.KS_ADMIN,
      surface: 'admin/overview',
      marker: 'admin-overview-kpis',
    },
  ] as const;

  test.describe('Neutral credential entry', () => {
    // Owned contexts omit project tenant headers and use public E2E fixtures; runner artifacts apply.
    for (const { key, identity, surface, marker } of NEUTRAL_LOGIN_CASES) {
      test(`normal UI identifies ${key} without tenant selection`, async ({
        browser,
      }, testInfo) => {
        const { origin, locale } = projectInfo(testInfo.project.use.baseURL?.toString());
        test.skip(
          !new URL(origin).hostname.startsWith('ida.'),
          'neutral UI proof uses IDA projects'
        );
        const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        try {
          const foreignTenant = identity.tenantId === 'tenant_ks' ? 'tenant_mk' : 'tenant_ks';
          await context.addCookies([{ name: 'tenantId', value: foreignTenant, url: origin }]);
          const page = await context.newPage();
          const login = new URL(`/${locale}/login`, origin);
          login.searchParams.set('default_booking_tenant_id', foreignTenant);
          login.searchParams.set('next', `/${locale}/${surface}`);
          await gotoApp(page, login.toString(), testInfo, { marker: 'auth-ready' });
          await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);
          await page.getByTestId('login-email').fill(identity.email);
          await page.getByTestId('login-password').fill(E2E_PASSWORD);
          const signIn = page.waitForResponse(
            response =>
              new URL(response.url()).pathname === '/api/auth/sign-in/email' &&
              response.request().method() === 'POST'
          );
          await page.getByTestId('login-submit').click();
          const response = await signIn;
          expect(response.status()).toBe(200);
          const submitted = response.request().postDataJSON() as { additionalData?: unknown };
          expect(submitted.additionalData).toBeUndefined();
          expect(response.request().headers()['x-tenant-id']).toBeUndefined();
          await expect(page).toHaveURL(new URL(`/${locale}/${surface}`, origin).toString());
          await expect(page.getByTestId(marker)).toBeVisible();
          const sessionResponse = await context.request.get(
            new URL('/api/auth/get-session', origin).toString()
          );
          expect(sessionResponse.status()).toBe(200);
          const session = (await sessionResponse.json()) as {
            user?: { tenantId?: string; role?: string };
          };
          expect(session.user?.tenantId).toBe(identity.tenantId);
          expect(session.user?.role).toBe(identity.dbRole);
          await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);
        } finally {
          await context.close();
        }
      });
    }

    test('explicit tenant query remains deliberate context through normal UI entry', async ({
      browser,
    }, testInfo) => {
      const { origin, locale } = projectInfo(testInfo.project.use.baseURL?.toString());
      test.skip(!new URL(origin).hostname.startsWith('ida.'), 'neutral UI proof uses IDA projects');
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        await context.addCookies([{ name: 'tenantId', value: 'tenant_ks', url: origin }]);
        const page = await context.newPage();
        const login = new URL(`/${locale}/login`, origin);
        login.searchParams.set('tenantId', 'tenant_mk');
        login.searchParams.set('next', `/${locale}/member/claims`);
        await gotoApp(page, login.toString(), testInfo, { marker: 'auth-ready' });
        await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);
        await page.getByTestId('login-email').fill(E2E_USERS.KS_MEMBER.email);
        await page.getByTestId('login-password').fill(E2E_PASSWORD);
        const refused = page.waitForResponse(
          response =>
            new URL(response.url()).pathname === '/api/auth/sign-in/email' &&
            response.request().method() === 'POST'
        );
        await page.getByTestId('login-submit').click();
        const rejected = await refused;
        expect(rejected.status()).toBe(401);
        expect(rejected.request().postDataJSON().additionalData).toEqual({ tenantId: 'tenant_mk' });
        expect(rejected.request().headers()['x-tenant-id']).toBeUndefined();
        expect(await rejected.json()).toEqual({
          code: 'WRONG_TENANT_CONTEXT',
          message: 'Wrong tenant context',
        });
        const unauthenticated = await context.request.get(
          new URL('/api/auth/get-session', origin).toString()
        );
        expect(await unauthenticated.json()).toBeNull();
        await expect(page.getByTestId('login-submit')).toBeEnabled();
        await page.getByTestId('login-email').fill(E2E_USERS.MK_MEMBER.email);
        const accepted = page.waitForResponse(
          response =>
            new URL(response.url()).pathname === '/api/auth/sign-in/email' &&
            response.request().method() === 'POST'
        );
        await page.getByTestId('login-submit').click();
        const signedIn = await accepted;
        expect(signedIn.status()).toBe(200);
        expect(signedIn.request().postDataJSON().additionalData).toEqual({ tenantId: 'tenant_mk' });
        await expect(page).toHaveURL(new URL(`/${locale}/member/claims`, origin).toString());
        const verified = await context.request.get(
          new URL('/api/auth/get-session', origin).toString()
        );
        const session = (await verified.json()) as { user?: { tenantId?: string; role?: string } };
        expect(session.user?.tenantId).toBe('tenant_mk');
        expect(session.user?.role).toBe(E2E_USERS.MK_MEMBER.dbRole);
      } finally {
        await context.close();
      }
    });

    test('neutral entry retains real credential and origin rejection', async ({
      browser,
    }, testInfo) => {
      const { origin, locale } = projectInfo(testInfo.project.use.baseURL?.toString());
      test.skip(!new URL(origin).hostname.startsWith('ida.'), 'neutral UI proof uses IDA projects');
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const page = await context.newPage();
        await gotoApp(page, new URL(`/${locale}/login`, origin).toString(), testInfo, {
          marker: 'auth-ready',
        });
        await page.getByTestId('login-email').fill(E2E_USERS.MK_MEMBER.email);
        await page.getByTestId('login-password').fill('incorrect-password-for-negative-proof');
        const credentialFailure = page.waitForResponse(
          response =>
            new URL(response.url()).pathname === '/api/auth/sign-in/email' &&
            response.request().method() === 'POST'
        );
        await page.getByTestId('login-submit').click();
        const denied = await credentialFailure;
        expect(denied.status()).toBe(401);
        expect(denied.request().postDataJSON().additionalData).toBeUndefined();
        expect((await denied.json()).code).toBe('INVALID_EMAIL_OR_PASSWORD');
        await expect(page.getByTestId('login-submit')).toBeEnabled();
        const hostileOrigin = await context.request.post(
          new URL('/api/auth/sign-in/email', origin).toString(),
          {
            headers: { origin: 'https://evil.example' },
            data: { email: E2E_USERS.MK_MEMBER.email, password: E2E_PASSWORD },
          }
        );
        expect(hostileOrigin.status()).toBe(403);
        const session = await context.request.get(
          new URL('/api/auth/get-session', origin).toString()
        );
        expect(await session.json()).toBeNull();
      } finally {
        await context.close();
      }
    });
  });
}
