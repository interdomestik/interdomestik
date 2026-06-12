import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { expect, test, type TestInfo } from '@playwright/test';

import { gotoApp } from '../utils/navigation';

type FrontDoorTenant = 'tenant_ks' | 'tenant_mk';

function projectInfo(baseURL: string | undefined): {
  origin: string;
  locale: string;
} {
  const url = new URL(baseURL ?? 'https://ida.127.0.0.1.nip.io:3000');
  const firstSegment = url.pathname.split('/').find(Boolean) ?? 'en';
  const locale = /^(sq|mk|en)$/i.test(firstSegment) ? firstSegment.toLowerCase() : 'en';
  return { origin: url.origin, locale };
}

function frontDoorTenant(testInfo: TestInfo): FrontDoorTenant | null {
  const tenantId = testInfo.project.use.extraHTTPHeaders?.['x-tenant-id'];
  if (tenantId === 'tenant_mk' || tenantId === 'tenant_ks') return tenantId;
  return null;
}

function userForTenant(tenantId: FrontDoorTenant) {
  return tenantId === 'tenant_mk' ? E2E_USERS.MK_MEMBER : E2E_USERS.KS_MEMBER;
}

test.describe('Front-door session context', () => {
  test('renders ida.* public landing without a tenant cookie', async ({ browser }, testInfo) => {
    const { origin, locale } = projectInfo(testInfo.project.use.baseURL?.toString());
    if (!new URL(origin).hostname.startsWith('ida.')) {
      test.skip(true, 'front-door public contract only runs in ida projects');
      return;
    }

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      const docResponse = await gotoApp(page, new URL(`/${locale}`, origin).toString(), testInfo, {
        marker: 'landing-page-ready',
      });

      expect(docResponse?.headers()['x-e2e-tenant']).toBe('none');
      expect(docResponse?.headers()['x-e2e-tenant-context']).toBe('public');
      await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);

      const tenantCookie = (await context.cookies(origin)).find(
        cookie => cookie.name === 'tenantId'
      );
      expect(tenantCookie).toBeUndefined();
    } finally {
      await context.close();
    }
  });

  test('logs in on ida.* without country-host tenant identity', async ({ page }, testInfo) => {
    const { origin, locale } = projectInfo(testInfo.project.use.baseURL?.toString());
    const projectHeaders = testInfo.project.use.extraHTTPHeaders ?? {};
    const tenantId = frontDoorTenant(testInfo);
    if (tenantId === null) {
      test.skip(true, 'front-door contract only runs in explicit ida projects');
      return;
    }
    const seededUser = userForTenant(tenantId);
    const forwardedHostHeader = 'x-forwarded-host';

    expect(projectHeaders[forwardedHostHeader]).toBeUndefined();
    expect(new URL(origin).hostname.startsWith('ida.')).toBe(true);

    const signInRes = await page.request.post(
      new URL('/api/auth/sign-in/email', origin).toString(),
      {
        data: { email: seededUser.email, password: E2E_PASSWORD },
        headers: {
          Origin: origin,
          Referer: `${origin}/${locale}/login`,
          ...projectHeaders,
        },
      }
    );
    expect(signInRes.ok(), await signInRes.text()).toBe(true);

    const sessionRes = await page.request.get(new URL('/api/auth/get-session', origin).toString(), {
      headers: {
        Origin: origin,
        ...projectHeaders,
      },
    });
    expect(sessionRes.ok(), await sessionRes.text()).toBe(true);

    const sessionPayload = (await sessionRes.json()) as {
      user?: { tenantId?: string | null };
    } | null;
    expect(sessionPayload?.user?.tenantId).toBe(tenantId);

    await gotoApp(page, new URL(`/${locale}/member`, origin).toString(), testInfo, {
      marker: 'body',
    });

    await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);
    await expect(page.getByTestId('member-dashboard-ready').first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
