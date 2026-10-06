import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

// Own fresh sessions: normal UI logout must not revoke a reused project state.
test.use({ storageState: { cookies: [], origins: [] } });

const MOBILE_DRAWER = '[data-sidebar="sidebar"][data-mobile="true"][data-state="open"]';
const ACCOUNT_BUTTON = '[data-sidebar="footer"] button[data-sidebar="menu-button"]';

async function openMobileAccount(page: Page) {
  const trigger = page.locator('button[data-sidebar="trigger"]:visible');
  await expect(trigger).toHaveCount(1);
  await trigger.click();
  const drawer = page.locator(MOBILE_DRAWER);
  await expect(drawer).toHaveCount(1);
  await expect(drawer).toBeVisible();
  // An exiting Sheet can remain visible; use the open owner and finish its animation.
  await expect
    .poll(() =>
      drawer.evaluate(node =>
        node
          .getAnimations()
          .every(animation => animation.playState === 'finished' || animation.playState === 'idle')
      )
    )
    .toBe(true);
  const account = drawer.locator(ACCOUNT_BUTTON);
  await expect(account).toHaveCount(1);
  const geometry = await account.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const viewport = window.visualViewport;
    if (!viewport) throw new Error('Visual viewport required for mobile regression');
    return {
      left: rect.left - viewport.offsetLeft,
      top: rect.top - viewport.offsetTop,
      right: rect.right - viewport.offsetLeft,
      bottom: rect.bottom - viewport.offsetTop,
      width: viewport.width,
      height: viewport.height,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.width).toBeCloseTo(page.viewportSize()!.width, 0);
  await account.click();
  const menu = page.getByRole('menu');
  await expect(menu).toHaveCount(1);
  await expect(menu).toBeVisible();
  // The mounted admin menu's final direct action is localized Logout.
  await expect(menu.getByRole('menuitem').last()).toBeVisible();
  return menu;
}

async function assertLocalizedLogin(page: Page, locale: string) {
  await expect(page).toHaveURL(new RegExp(`/${locale}/login(?:\\?|$)`));
  const form = page.getByTestId('login-form');
  await expect(form).toHaveCount(1);
  await expect(form).toBeVisible();
  await expect(form.getByTestId('login-email')).toBeEditable();
  const password = form.getByTestId('login-password');
  await expect(password).toBeEditable();
  const toggle = password.locator('..').getByRole('button');
  await expect(toggle).toHaveCount(1);
  await toggle.click();
  await expect(password).toHaveAttribute('type', 'text');
  await toggle.click();
  await expect(password).toHaveAttribute('type', 'password');
}

async function assertLoggedOut(page: Page, testInfo: TestInfo, locale: string) {
  await assertLocalizedLogin(page, locale);
  await gotoApp(page, routes.adminUsers(locale), testInfo, { marker: 'auth-ready' });
  await assertLocalizedLogin(page, locale);
}

test.describe('mobile admin account actionability', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });

  for (const width of [390, 320]) {
    test(`normal account clicks and logout remain reachable at ${width} CSS px in four locales`, async ({
      page,
      loginAs,
    }, testInfo) => {
      await loginAs('admin');
      await page.setViewportSize({ width, height: 844 });
      for (const locale of ['en', 'sq', 'mk', 'sr'] as const) {
        await gotoApp(page, routes.adminUsers(locale), testInfo, { marker: 'admin-users-page' });
        await expect(page.getByTestId('admin-users-page')).toHaveCount(1);
        await openMobileAccount(page);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('menu')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-sidebar="sidebar"][data-mobile="true"]')).toHaveCount(0);
      }
      const menu = await openMobileAccount(page);
      await menu.getByRole('menuitem').last().click();
      await assertLoggedOut(page, testInfo, 'sr');
    });
  }
});

test('desktop admin account menu preserves normal logout and protected denial', async ({
  page,
  loginAs,
}, testInfo) => {
  await loginAs('admin');
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoApp(page, routes.adminUsers(testInfo), testInfo, { marker: 'admin-users-page' });
  const account = page.locator('[data-sidebar="sidebar"]:visible').locator(ACCOUNT_BUTTON);
  await expect(account).toHaveCount(1);
  await account.click();
  const menu = page.getByRole('menu');
  await expect(menu).toHaveCount(1);
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem').last().click();
  await assertLoggedOut(page, testInfo, routes.getLocale(testInfo));
});
