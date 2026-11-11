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
  await page.getByTestId('login-email').fill(E2E_USERS[actor].email);
  await page.getByTestId('login-password').fill(E2E_PASSWORD);
  await page.getByTestId('login-submit').click();
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
