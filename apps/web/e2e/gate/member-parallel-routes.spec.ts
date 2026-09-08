import type { Page, TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import en from '../../src/messages/en/dashboard.json';
import mk from '../../src/messages/mk/dashboard.json';
import sq from '../../src/messages/sq/dashboard.json';
import sr from '../../src/messages/sr/dashboard.json';
import { expect, test } from '../fixtures/auth.fixture';
import {
  credsFor,
  getProjectUrlInfo,
  getTenantFromTestInfo,
  ipForRole,
} from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const CATALOGS = { en, mk, sq, sr } as const;
const copyFor = (info: TestInfo) => {
  const locale = routes.getLocale(info);
  if (!(locale in CATALOGS)) throw new Error(`Unsupported member portal locale: ${locale}`);
  return CATALOGS[locale as keyof typeof CATALOGS].dashboard.portal;
};
const portal = (page: Page) => page.getByTestId('member-dashboard-ready');
const DOCUMENT_ID = '__t117cDocumentIdentity';

async function expectHome(page: Page, info: TestInfo) {
  await expect(page).toHaveURL(url => url.pathname === routes.member(info));
  await expect(portal(page)).toHaveCount(1);
  await expect(portal(page)).toBeVisible();
  const copy = copyFor(info);
  const regions = portal(page).locator('section[aria-label]');
  await expect(regions).toHaveCount(3);
  await expect(portal(page).getByTestId('member-portal-disclaimer')).toHaveText(copy.disclaimer);
  for (const [index, key] of (['case', 'actions', 'updates'] as const).entries()) {
    const region = regions.nth(index);
    await expect(region).toHaveAccessibleName(copy.regions[key].label);
    await expect(region).toBeVisible();
    // A real region must settle; generic structural loading alone is not proof.
    const settled =
      key === 'actions' ? 'a,[role="alert"]' : 'article,li,[role="status"],[role="alert"]';
    await expect(region.locator(settled).first()).toBeVisible();
  }
}

async function expectChild(page: Page, info: TestInfo, path: string, marker: string) {
  await expect(page).toHaveURL(url => url.pathname === path);
  await expect(page.getByTestId(marker)).toBeVisible();
  await expect(portal(page)).toHaveCount(0);
  await expect(page.getByTestId('member-portal-disclaimer')).toHaveCount(0);
  for (const region of Object.values(copyFor(info).regions)) {
    await expect(page.getByRole('region', { name: region.label, exact: true })).toHaveCount(0);
  }
}

test.describe('Member home parallel-route lifecycle', () => {
  test('hard load and refresh recover all three home regions exactly once', async ({
    authenticatedPage: page,
  }, info) => {
    const response = await gotoApp(page, routes.member(info), info, {
      marker: 'member-dashboard-ready',
    });
    expect(response?.status()).toBe(200);
    await expectHome(page, info);
    const refreshed = await page.reload({ waitUntil: 'domcontentloaded' });
    expect(refreshed?.status()).toBe(200);
    await expectHome(page, info);
  });

  for (const child of [
    {
      name: 'documents',
      path: (info: TestInfo) => `${routes.member(info)}/documents`,
      marker: 'member-documents-page-ready',
    },
    { name: 'membership', path: routes.memberMembership, marker: 'membership-page-ready' },
  ]) {
    test(`soft ${child.name} navigation unmounts home slots and back/forward restores the right tree`, async ({
      authenticatedPage: page,
    }, info) => {
      await gotoApp(page, routes.member(info), info, { marker: 'member-dashboard-ready' });
      await expectHome(page, info);
      const identity = randomUUID();
      await page.evaluate(({ key, value }) => Reflect.set(window, key, value), {
        key: DOCUMENT_ID,
        value: identity,
      });
      const path = child.path(info);
      await portal(page).getByRole('navigation').locator(`a[href="${path}"]`).click();
      await expectChild(page, info, path, child.marker);
      expect(await page.evaluate(key => Reflect.get(window, key), DOCUMENT_ID)).toBe(identity);

      await page.goBack();
      await expectHome(page, info);
      expect(await page.evaluate(key => Reflect.get(window, key), DOCUMENT_ID)).toBe(identity);
      await page.goForward();
      await expectChild(page, info, path, child.marker);

      const refreshed = await page.reload({ waitUntil: 'domcontentloaded' });
      expect(refreshed?.status()).toBe(200);
      await expectChild(page, info, path, child.marker);
      expect(await page.evaluate(key => Reflect.get(window, key), DOCUMENT_ID)).toBeUndefined();
      await page.goBack();
      await expectHome(page, info);
    });
  }

  test('a revoked test-owned session cannot recover protected slots on the next request', async ({
    browser,
  }, info) => {
    const project = getProjectUrlInfo(info);
    const headers = {
      ...info.project.use.extraHTTPHeaders,
      Origin: project.origin,
      Referer: new URL(routes.login(info), project.origin).toString(),
      'x-forwarded-for': ipForRole('member'),
    };
    // A fresh isolated session avoids revoking any shared project storageState.
    const context = await browser.newContext({
      baseURL: project.baseURL,
      extraHTTPHeaders: info.project.use.extraHTTPHeaders,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    let token: string | null = null;
    let revoked = false;
    const revoke = () =>
      page.request.post(new URL('/api/auth/revoke-session', project.origin).toString(), {
        data: { token },
        headers,
      });
    let bodyError: unknown;
    let cleanupError: unknown;
    try {
      const { email, password } = credsFor('member', getTenantFromTestInfo(info));
      const login = await page.request.post(
        new URL('/api/auth/sign-in/email', project.origin).toString(),
        { data: { email, password }, headers }
      );
      expect(login.ok(), `Fresh session creation returned ${login.status()}`).toBe(true);
      const result = await login.json();
      if (typeof result.token !== 'string' || !result.token)
        throw new Error('Fresh session token missing');
      token = result.token;
      await gotoApp(page, routes.member(info), info, { marker: 'member-dashboard-ready' });
      await expectHome(page, info);
      const originalCookies = await context.cookies();
      const response = await revoke();
      expect(response.ok(), `Scoped revocation returned ${response.status()}`).toBe(true);
      expect((await response.json()).status).toBe(true);
      revoked = true;
      // Replay this test's original browser cookies: cookie removal alone must
      // not account for the rejection of the now-revoked server session.
      await context.addCookies(originalCookies);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(url => url.pathname === routes.login(info));
      await expect(portal(page)).toHaveCount(0);
      await expect(page.getByTestId('member-portal-disclaimer')).toHaveCount(0);
    } catch (error) {
      bodyError = error;
    } finally {
      try {
        if (token && !revoked) {
          const cleanup = await revoke();
          expect(cleanup.ok(), `Scoped session cleanup returned ${cleanup.status()}`).toBe(true);
        }
      } catch (error) {
        cleanupError = error;
      }
      try {
        await context.close();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (bodyError) throw bodyError;
    if (cleanupError) throw cleanupError;
  });
});
