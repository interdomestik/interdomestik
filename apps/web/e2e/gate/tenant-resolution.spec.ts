import { expect, test } from '@playwright/test';

function projectInfo(baseURL: string | undefined): {
  origin: string;
  locale: string;
  host: string;
} {
  const url = new URL(baseURL ?? 'http://127.0.0.1:3000/en');
  const firstSegment = url.pathname.split('/').find(Boolean) ?? 'en';
  const locale = /^(sq|mk|en)$/i.test(firstSegment) ? firstSegment.toLowerCase() : 'en';
  return { origin: url.origin, locale, host: url.hostname };
}

test.describe('Tenant resolution contract', () => {
  test('Tenant host login shows no chooser', async ({ page }, testInfo) => {
    const { origin, locale } = projectInfo(testInfo.project.use.baseURL?.toString());

    await page.goto(new URL(`/${locale}/login`, origin).toString(), {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);

    // Auth endpoints must be rooted: /api/auth/* (never /{locale}/api/auth/*)
    // Probe a known Better Auth endpoint and assert it exists on the root origin.
    const signInRes = await page.request.post(
      new URL('/api/auth/sign-in/email', origin).toString(),
      {
        data: { email: 'invalid@example.com', password: 'invalid' },
        headers: { Origin: origin },
      }
    );
    expect(signInRes.status(), 'Expected /api/auth/* endpoint on root origin').not.toBe(404);
  });

  test('Tenant host is locale-independent (host determines tenant)', async ({
    browser,
  }, testInfo) => {
    const { origin, host } = projectInfo(testInfo.project.use.baseURL?.toString());

    // Required cross-locale contract checks:
    // - mk.* host must resolve tenant_mk even on /sq
    // - ks.* host must resolve tenant_ks even on /mk
    let targetLocale: string | null = null;
    let expectedTenant: string | null = null;

    if (host.startsWith('mk.')) {
      targetLocale = 'sq';
      expectedTenant = 'tenant_mk';
    } else if (host.startsWith('ks.')) {
      targetLocale = 'mk';
      expectedTenant = 'tenant_ks';
    }

    test.skip(!targetLocale || !expectedTenant, 'Only enforced for tenant hosts in this suite');

    // Use a fresh context to ensure we prove host-only resolution (no pre-seeded tenant cookie).
    const context = await browser.newContext();
    const page = await context.newPage();

    // Ensure middleware sees our debug header even on the main document request.
    await page.route('**/*', async route => {
      const headers = {
        ...route.request().headers(),
        'x-e2e-debug': '1',
      };
      await route.continue({ headers });
    });

    const originUrl = new URL('/', origin).toString();
    const beforeCookies = await context.cookies(originUrl);
    expect(beforeCookies.some(c => c.name === 'tenantId')).toBe(false);

    const docResponse = await page.goto(new URL(`/${targetLocale}/login`, origin).toString(), {
      waitUntil: 'domcontentloaded',
    });

    // Origin must not drift (e.g., ks.localhost must never become localhost).
    expect(new URL(page.url()).origin).toBe(origin);

    // Locale must be preserved (no rewrites).
    expect(new URL(page.url()).pathname).toBe(`/${targetLocale}/login`);

    await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);

    const afterCookies = await context.cookies(originUrl);
    const tenantCookie = afterCookies.find(c => c.name === 'tenantId');

    if (tenantCookie?.value !== expectedTenant) {
      const debugCookie = (name: string): string =>
        afterCookies.find(c => c.name === name)?.value ?? '';
      const headersArray = (await docResponse?.headersArray()) ?? [];
      const setCookies = headersArray
        .filter(h => h.name.toLowerCase() === 'set-cookie')
        .map(h => h.value);
      const headerValue = (name: string): string =>
        headersArray.find(h => h.name.toLowerCase() === name)?.value ?? '';

      throw new Error(
        [
          'Expected tenantId cookie to be set based on host.',
          `expected=${expectedTenant}`,
          `actual=${tenantCookie?.value ?? ''}`,
          `set-cookie=${setCookies.join(' | ')}`,
          `cookie:e2e_raw_host=${debugCookie('e2e_raw_host')}`,
          `cookie:e2e_forwarded_host=${debugCookie('e2e_forwarded_host')}`,
          `cookie:e2e_nexturl_host=${debugCookie('e2e_nexturl_host')}`,
          `cookie:e2e_request_host=${debugCookie('e2e_request_host')}`,
          `cookie:e2e_host_tenant=${debugCookie('e2e_host_tenant')}`,
          `cookie:e2e_resolved_tenant=${debugCookie('e2e_resolved_tenant')}`,
          `x-e2e-raw-host=${headerValue('x-e2e-raw-host')}`,
          `x-e2e-forwarded-host=${headerValue('x-e2e-forwarded-host')}`,
          `x-e2e-nexturl-host=${headerValue('x-e2e-nexturl-host')}`,
          `x-e2e-request-host=${headerValue('x-e2e-request-host')}`,
          `x-e2e-host-tenant=${headerValue('x-e2e-host-tenant')}`,
          `x-e2e-resolved-tenant=${headerValue('x-e2e-resolved-tenant')}`,
        ].join('\n')
      );
    }

    await context.close();
  });

  test('Neutral host shows chooser when no tenant context', async ({ page }) => {
    const neutral = 'http://127.0.0.1:3000';
    await page.goto(`${neutral}/en/login`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('tenant-chooser')).toBeVisible();
  });

  test('Neutral host keeps chooser even if locale is /sq', async ({ page }) => {
    const neutral = 'http://127.0.0.1:3000';
    await page.goto(`${neutral}/sq/login`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('tenant-chooser')).toBeVisible();
  });

  test('Neutral host skips chooser when tenantId cookie exists', async ({ browser }) => {
    const neutral = 'http://127.0.0.1:3000';
    const context = await browser.newContext();

    await context.addCookies([
      {
        name: 'tenantId',
        value: 'tenant_ks',
        domain: '127.0.0.1',
        path: '/',
        httpOnly: false,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    await page.goto(`${neutral}/sq/login`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);

    await context.close();
  });
});
