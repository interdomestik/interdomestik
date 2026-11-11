import { E2E_PASSWORD, E2E_USER_IDS, E2E_USERS, type E2EUserKey } from '@interdomestik/database';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { requireDoorActor } from './one-door-data.fixture';
import { gotoApp } from '../utils/navigation';

export function doorLocation(info: TestInfo): { origin: string; locale: string } {
  const baseUrl = new URL(info.project.use.baseURL?.toString() ?? 'http://localhost:3000');
  const host = process.env.IDA_HOST;
  if (!host) throw new Error('One-door proof requires configured IDA_HOST');
  const door = new URL(host.includes('://') ? host : `${baseUrl.protocol}//${host}`);
  return { origin: door.origin, locale: baseUrl.pathname.split('/').find(Boolean) ?? 'en' };
}

export const test = base.extend<{ door: { page: Page; origin: string; locale: string } }>({
  door: async ({ browser }, use, info) => {
    const { origin, locale } = doorLocation(info);
    const context = await browser.newContext({
      baseURL: origin,
      extraHTTPHeaders: {},
      storageState: { cookies: [], origins: [] },
      ignoreHTTPSErrors: true,
    });
    // Cookie consent is a privacy preference, not tenant authority; seeding it keeps the
    // banner from covering door controls while every authority input stays empty.
    await context.addCookies([{ name: 'cookie_consent', value: 'accepted', url: origin }]);
    await context.addInitScript(() => {
      window.localStorage.setItem('interdomestik_cookie_consent_v1', 'accepted');
    });
    try {
      const page = await context.newPage();
      await use({ page, origin, locale });
    } finally {
      await context.close();
    }
  },
});
export { expect };

export async function loginAtDoor(
  page: Page,
  origin: string,
  locale: string,
  actor: E2EUserKey,
  info: TestInfo
): Promise<void> {
  const expected = await requireDoorActor(actor);
  await gotoApp(page, `/${locale}/login`, info, {
    baseURL: origin,
    marker: 'auth-ready',
  });
  // Prove the client form is hydrated before typing, so React state owns the filled values.
  // A pre-hydration click is a no-op, so retry the toggle until React handles it.
  const password = page.getByTestId('login-password');
  const visibility = password.locator('..').getByRole('button');
  await expect(async () => {
    if ((await password.getAttribute('type')) !== 'text') await visibility.click();
    await expect(password).toHaveAttribute('type', 'text', { timeout: 1_000 });
  }).toPass();
  await visibility.click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByTestId('login-email').fill(E2E_USERS[actor].email);
  await password.fill(E2E_PASSWORD);
  await expect(page.getByTestId('login-email')).toHaveValue(E2E_USERS[actor].email);
  const [signIn] = await Promise.all([
    page.waitForResponse(
      res =>
        new URL(res.url()).pathname === '/api/auth/sign-in/email' &&
        res.request().method() === 'POST'
    ),
    page.getByTestId('login-submit').click(),
  ]);
  expect(signIn.status()).toBe(200);
  // Let the form's post-login redirect settle so it cannot interrupt the caller's next navigation.
  await page.waitForURL(url => !/\/login\/?$/.test(url.pathname), { waitUntil: 'load' });
  await expect
    .poll(async () => {
      const response = await page.request.get(`${origin}/api/auth/get-session`);
      if (response.status() !== 200) return null;
      return (await response.json())?.user?.id;
    })
    .toBe(E2E_USER_IDS[actor]);
  const response = await page.request.get(`${origin}/api/auth/get-session`);
  expect(response.status()).toBe(200);
  const session = await response.json();
  expect(session.user).toMatchObject({
    id: expected.id,
    tenantId: expected.tenantId,
    role: expected.role,
  });
  expect(session.user.branchId ?? null).toBe(expected.branchId);
  expect(new URL(page.url()).origin).toBe(origin);
}

export function directDoorUpload(
  page: Page,
  origin: string,
  claimId: string,
  name: string,
  bytes: Buffer,
  headers: Record<string, string> = {}
) {
  return page.request.post(`${origin}/api/claims/evidence-upload`, {
    headers,
    maxRedirects: 0,
    multipart: {
      claimId,
      category: 'evidence',
      locale: 'en',
      file: { name, mimeType: 'message/rfc822', buffer: bytes },
    },
  });
}

export async function fillBusinessIntake(page: Page, email: string): Promise<void> {
  await page.locator('[name="firstName"]').fill('Door');
  await page.locator('[name="lastName"]').fill('Test');
  await page.locator('[name="companyName"]').fill('One Door Test');
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="phone"]').fill('+38970123456');
  await page.locator('[name="teamSize"]').selectOption('1-10');
  await page.locator('[name="consent"]').check();
}
