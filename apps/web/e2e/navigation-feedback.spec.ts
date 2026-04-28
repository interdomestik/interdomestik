import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

async function delayRouteTransition(page: Page, pathSuffix: string) {
  let delayedFirstMatch = false;

  await page.route(
    requestUrl => {
      const url = new URL(requestUrl.toString());
      return url.pathname.endsWith(pathSuffix);
    },
    async route => {
      if (delayedFirstMatch) {
        await route.continue();
        return;
      }

      delayedFirstMatch = true;
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.continue();
    }
  );
}

async function expectNavigationFeedbackForSidebarLink({
  page,
  linkHrefSuffix,
  targetPathSuffix,
  rootTestId,
}: {
  page: Page;
  linkHrefSuffix: string;
  targetPathSuffix: string;
  rootTestId?: string;
}) {
  await delayRouteTransition(page, targetPathSuffix);

  const progress = page.getByTestId('portal-navigation-progress');
  const root = rootTestId ? page.getByTestId(rootTestId) : page.locator('body');
  const link = root.locator(`a[href$="${linkHrefSuffix}"]`).first();
  await expect(link).toBeVisible();

  const click = link.click();
  try {
    await expect(progress).toBeVisible({ timeout: 2_000 });
    await click;

    await expect(page).toHaveURL(new RegExp(`${targetPathSuffix}(?:[?#].*)?$`));
    await expect(page.getByTestId('dashboard-page-ready')).toBeVisible();
    await expect(progress).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
}

test.describe('Portal navigation feedback', () => {
  test('member sidebar links show and clear navigation feedback', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(testInfo), testInfo, {
      marker: 'member-dashboard-ready',
    });

    await expectNavigationFeedbackForSidebarLink({
      page,
      linkHrefSuffix: '/member/claims',
      targetPathSuffix: '/member/claims',
    });
  });

  test('admin sidebar links show and clear navigation feedback', async ({
    adminPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.admin(testInfo), testInfo, {
      marker: 'admin-page-ready',
    });

    await expectNavigationFeedbackForSidebarLink({
      page,
      linkHrefSuffix: '/admin/claims',
      targetPathSuffix: '/admin/claims',
      rootTestId: 'admin-sidebar',
    });
  });
});
