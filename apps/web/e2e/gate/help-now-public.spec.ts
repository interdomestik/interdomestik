import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

function publicContextOptions(testInfo: TestInfo) {
  return {
    baseURL: testInfo.project.use.baseURL,
    extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
    storageState: { cookies: [], origins: [] },
  };
}

async function expectOnlyPublicHelpNowSurface(page: Page) {
  await expect(page.getByTestId('help-now-page-ready')).toBeVisible();
  await expect(page.getByTestId('help-now-page-ready')).toHaveAttribute(
    'data-scope',
    'public-no-account'
  );
  await expect(page.getByTestId('member-page-ready')).toHaveCount(0);
  await expect(page.getByTestId('agent-page-ready')).toHaveCount(0);
  await expect(page.getByTestId('staff-page-ready')).toHaveCount(0);
  await expect(page.getByTestId('admin-page-ready')).toHaveCount(0);
}

function watchProtectedSurfaceRequests(page: Page) {
  const protectedRequests: string[] = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    const isProtectedApi = /^\/api\/(member|agent|staff|admin)(\/|$)/.test(pathname);
    const isProtectedRoute = /^\/(sq|en|sr|mk|hr|de)\/(member|agent|staff|admin)(\/|$)/.test(
      pathname
    );
    if (isProtectedApi || isProtectedRoute) protectedRequests.push(pathname);
  });
  return protectedRequests;
}

test.describe('MOB-01 public Help Now route', () => {
  test('anonymous visitor opens Help Now without auth redirect', async ({ browser }, testInfo) => {
    const context = await browser.newContext(publicContextOptions(testInfo));
    const page = await context.newPage();
    const protectedRequests = watchProtectedSurfaceRequests(page);

    try {
      const response = await gotoApp(page, routes.helpNow(testInfo), testInfo, {
        marker: 'help-now-page-ready',
      });

      expect(response?.status(), 'help-now should not redirect to auth').toBe(200);
      expect(response?.headers().location, 'help-now should not emit a redirect location').toBe(
        undefined
      );
      await expect(page).toHaveURL(new RegExp(`${routes.helpNow(testInfo)}$`));
      await expectOnlyPublicHelpNowSurface(page);
      expect(protectedRequests).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('signed-in member stays on Help Now public route', async ({ page, loginAs }, testInfo) => {
    await loginAs('member');
    await page.waitForLoadState('networkidle');
    const protectedRequests = watchProtectedSurfaceRequests(page);

    const response = await gotoApp(page, routes.helpNow(testInfo), testInfo, {
      marker: 'help-now-page-ready',
    });

    expect(response?.status(), 'member should not be redirected away from Help Now').toBe(200);
    await expect(page).toHaveURL(new RegExp(`${routes.helpNow(testInfo)}$`));
    await expectOnlyPublicHelpNowSurface(page);
    expect(protectedRequests).toEqual([]);
  });

  test('MK Help Now exposes the accepted public pack only', async ({ browser }, testInfo) => {
    const context = await browser.newContext(publicContextOptions(testInfo));
    const page = await context.newPage();
    const protectedRequests = watchProtectedSurfaceRequests(page);

    try {
      const response = await gotoApp(page, routes.helpNow('mk'), testInfo, {
        marker: 'help-now-page-ready',
      });

      expect(response?.status(), 'MK Help Now should load as a public route').toBe(200);
      await expect(page).toHaveURL(/\/mk\/help-now/);
      await expectOnlyPublicHelpNowSurface(page);
      await expect(page.getByLabel('Trip country')).toHaveValue('MK');
      await expect(page.getByText('Signed packs: 1')).toBeVisible();
      await expect(page.getByTestId('help-now-generate-pack')).toBeVisible();
      await expect(page.getByText(/112|192/)).toHaveCount(0);
      expect(protectedRequests).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
