import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const pilotHeaders = { 'x-tenant-id': 'tenant_ks' };

function idaTarget(info: TestInfo): TestInfo {
  const configured = process.env.IDA_HOST?.trim() || 'ida.127.0.0.1.nip.io:3000';
  const target = new URL(configured.includes('://') ? configured : `http://${configured}`);
  return {
    ...info,
    project: {
      ...info.project,
      use: {
        ...info.project.use,
        baseURL: `${target.origin}/${routes.getLocale(info)}`,
        extraHTTPHeaders: pilotHeaders,
      },
    },
  } as TestInfo;
}

async function authPost(page: Page, info: TestInfo, path: string, data: unknown) {
  const origin = new URL(String(info.project.use.baseURL)).origin;
  return page.request.post(`${origin}/api/auth/${path}`, {
    data,
    failOnStatusCode: false,
    headers: { Origin: origin, Referer: `${origin}${routes.login(info)}`, ...pilotHeaders },
  });
}

async function login(page: Page, info: TestInfo) {
  const response = await authPost(page, info, 'sign-in/email', {
    email: E2E_USERS.KS_MEMBER_EMPTY.email,
    password: E2E_PASSWORD,
  });
  expect(response.ok(), await response.text()).toBe(true);
  const token = ((await response.json()) as { token?: unknown }).token;
  if (typeof token !== 'string') throw new Error('different_email_recovery_login_failed');

  const origin = new URL(String(info.project.use.baseURL)).origin;
  const sessionResponse = await page.request.get(`${origin}/api/auth/get-session`, {
    failOnStatusCode: false,
    headers: { Origin: origin, ...pilotHeaders },
  });
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true);
  const session = (await sessionResponse.json()) as {
    user?: { id?: unknown; tenantId?: unknown };
  } | null;
  expect(typeof session?.user?.id).toBe('string');
  expect(session?.user?.tenantId).toBe('tenant_ks');
  return token;
}

async function openOrganizer(page: Page, info: TestInfo) {
  await gotoApp(page, routes.home('en'), info, { marker: 'free-start-intake-shell' });
  const organizer = page.getByTestId('premium-free-start-organizer');
  await expect(organizer).toBeVisible();
  return organizer;
}

test.describe('IDA-UI03b different-email recovery entry', () => {
  test('mounts only inside the verified manager and remains content-free and accessible', async ({
    browser,
  }, rawInfo) => {
    const info = idaTarget(rawInfo);
    const context = await browser.newContext({
      baseURL: info.project.use.baseURL,
      extraHTTPHeaders: pilotHeaders,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    let token: string | null = null;
    try {
      const organizer = await openOrganizer(page, info);
      token = await login(page, info);
      await organizer.getByTestId('free-start-manage-open').click();
      await expect(
        organizer.getByRole('heading', { name: /your saved drafts|draftet e ruajtura/i })
      ).toBeFocused({ timeout: 20_000 });
      const entry = organizer.getByTestId('different-email-recovery-open');
      await expect(entry).toBeVisible();
      expect((await entry.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await entry.focus();
      await page.keyboard.press('Enter');
      const recovery = organizer.getByTestId('different-email-recovery');
      const heading = recovery.getByRole('heading', {
        name: /different email|email tjetër|e-adresu|е-пошта/i,
      });
      await expect(heading).toBeFocused();
      await expect(recovery).not.toContainText(E2E_USERS.KS_MEMBER_EMPTY.email);
      await expect(recovery.locator('input')).toHaveCount(0);
      await page.setViewportSize({ width: 320, height: 720 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await recovery.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    } finally {
      if (token) await authPost(page, info, 'revoke-session', { token }).catch(() => undefined);
      await context.close();
    }

    const noJs = await browser.newContext({
      baseURL: info.project.use.baseURL,
      extraHTTPHeaders: pilotHeaders,
      javaScriptEnabled: false,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await noJs.newPage();
      await openOrganizer(page, info);
      await expect(page.getByTestId('different-email-recovery')).toHaveCount(0);
    } finally {
      await noJs.close();
    }
  });
});
