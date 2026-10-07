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
  for (const role of ['member', 'agent', 'staff', 'admin']) {
    await expect(page.getByTestId(`${role}-page-ready`)).toHaveCount(0);
  }
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
    const helpNowPage = await page.context().newPage();
    const protectedRequests = watchProtectedSurfaceRequests(helpNowPage);

    const response = await gotoApp(helpNowPage, routes.helpNow(testInfo), testInfo, {
      marker: 'help-now-page-ready',
    });

    expect(response?.status(), 'member should not be redirected away from Help Now').toBe(200);
    await expect(helpNowPage).toHaveURL(new RegExp(`${routes.helpNow(testInfo)}$`));
    await expectOnlyPublicHelpNowSurface(helpNowPage);
    expect(protectedRequests).toEqual([]);
    await helpNowPage.close();
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
      await expect(page.getByLabel('Земја на патување')).toHaveValue('MK');
      await expect(page.getByText('Упатствата за земјата се достапни')).toBeVisible();
      await expect(page.getByText(/Одобрени пакети/)).toHaveCount(0);
      await expect(page.getByTestId('help-now-generate-pack')).toBeVisible();
      const continuation = page.getByTestId('help-now-continue');
      await expect(continuation).toHaveCount(1);
      await expect(continuation).toBeVisible();
      const expectedHref = `${routes.home('mk')}/#free-start-intake`;
      await expect(continuation).toHaveAttribute('href', expectedHref);
      await expect(page.getByText(/112|192/)).toHaveCount(0);
      expect(protectedRequests).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('SQ Help Now link opens the home organizer natively', async ({ browser }, testInfo) => {
    const context = await browser.newContext(publicContextOptions(testInfo));
    const page = await context.newPage();
    const protectedRequests = watchProtectedSurfaceRequests(page);

    try {
      await gotoApp(page, routes.helpNow('sq'), testInfo, { marker: 'help-now-page-ready' });
      await expectOnlyPublicHelpNowSurface(page);
      await expect(page.getByLabel('Shteti i udhëtimit')).toHaveValue('XK');
      await expect(page.getByTestId('help-now-generate-pack')).toHaveCount(0);

      const continuation = page.getByRole('link', { name: 'Organizo të dhënat e ngjarjes' });
      await expect(continuation).toHaveCount(1);
      const expectedHref = `${routes.home('sq')}/#free-start-intake`;
      await expect(continuation).toHaveAttribute('href', expectedHref);

      await continuation.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/sq\/?#free-start-intake$/);

      const shell = page.locator('#free-start-intake');
      await expect(shell).toBeVisible();
      await expect(shell).toBeInViewport();
      await expect(shell.getByTestId('premium-free-start-organizer')).toBeVisible();
      await expect(page.getByTestId('help-now-page-ready')).toHaveCount(0);
      for (const role of ['member', 'agent', 'staff', 'admin']) {
        await expect(page.getByTestId(`${role}-page-ready`)).toHaveCount(0);
      }
      expect(new URL(page.url()).search).toBe('');
      expect(protectedRequests).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
