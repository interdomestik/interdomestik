import { expect, test } from '@playwright/test';

function localeForProject(projectName: string): string {
  return projectName.includes('mk') ? 'mk' : 'sq';
}

function tenantOriginForProject(baseURL: string | undefined): string {
  return new URL(baseURL ?? 'http://127.0.0.1:3000').origin;
}

test.describe('Tenant resolution contract', () => {
  test('Tenant host login shows no chooser', async ({ page }, testInfo) => {
    const locale = localeForProject(testInfo.project.name);
    const origin = tenantOriginForProject(testInfo.project.use.baseURL?.toString());

    await page.goto(new URL(`/${locale}/login`, origin).toString(), {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: /choose your country/i })).toHaveCount(0);

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

  test('Neutral host shows chooser when no tenant context', async ({ page }) => {
    const neutral = 'http://127.0.0.1:3000';
    await page.goto(`${neutral}/sq/login`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /choose your country/i })).toBeVisible();
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

    await expect(page.getByRole('heading', { name: /choose your country/i })).toHaveCount(0);

    await context.close();
  });
});
