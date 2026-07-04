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

test.describe('MOB-01 public Help Now route', () => {
  test('anonymous visitor opens Help Now without auth redirect', async ({ browser }, testInfo) => {
    const context = await browser.newContext(publicContextOptions(testInfo));
    const page = await context.newPage();

    try {
      const response = await gotoApp(page, routes.helpNow(testInfo), testInfo, {
        marker: 'help-now-page-ready',
      });

      expect(response?.status(), 'help-now should not redirect to auth').toBe(200);
      await expect(page).toHaveURL(new RegExp(`${routes.helpNow(testInfo)}$`));
      await expectOnlyPublicHelpNowSurface(page);
    } finally {
      await context.close();
    }
  });

  test('signed-in member stays on Help Now public route', async ({ page, loginAs }, testInfo) => {
    await loginAs('member');

    const response = await gotoApp(page, routes.helpNow(testInfo), testInfo, {
      marker: 'help-now-page-ready',
    });

    expect(response?.status(), 'member should not be redirected away from Help Now').toBe(200);
    await expect(page).toHaveURL(new RegExp(`${routes.helpNow(testInfo)}$`));
    await expectOnlyPublicHelpNowSurface(page);
  });
});
