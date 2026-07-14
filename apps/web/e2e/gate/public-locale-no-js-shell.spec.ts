import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';

import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const localeViewports = [
  { locale: 'sq', width: 320, height: 720 },
  { locale: 'en', width: 375, height: 812 },
  { locale: 'sr', width: 390, height: 844 },
  { locale: 'mk', width: 1440, height: 900 },
] as const;

async function withNoJsPage(
  browser: Browser,
  testInfo: TestInfo,
  viewport: { width: number; height: number },
  callback: (page: Page) => Promise<void>
) {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders as Record<string, string> | undefined,
    javaScriptEnabled: false,
    storageState: undefined,
    viewport,
  });

  try {
    await callback(await context.newPage());
  } finally {
    await context.close();
  }
}

async function openFallback(page: Page, testInfo: TestInfo, locale: string) {
  const response = await gotoApp(page, `/${locale}/#free-start-intake`, testInfo, {
    marker: 'landing-page-ready',
  });

  expect(response?.ok()).toBe(true);
}

async function expectServerVisibleFallback(page: Page) {
  const main = page.getByTestId('landing-page-ready');
  const intake = page.getByTestId('free-start-intake-shell');

  await expect(main).toBeVisible();
  await expect(intake).toBeVisible();
  await expect(intake.getByTestId('free-start-category-vehicle')).toBeVisible();
  await expect(intake.getByTestId('free-start-category-injury')).toBeVisible();
  await expect(intake.getByTestId('free-start-category-property')).toBeVisible();

  expect(
    await main.evaluate(element => {
      let current: Element | null = element;
      while (current) {
        const style = getComputedStyle(current);
        if (
          current.hasAttribute('hidden') ||
          style.display === 'none' ||
          style.visibility === 'hidden'
        ) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    })
  ).toBe(false);
  expect(await page.locator('body').innerText()).not.toHaveLength(0);
  expect(
    await page.locator('html').evaluate(element => element.scrollWidth <= innerWidth + 1)
  ).toBe(true);
}

test.describe('public locale shell without JavaScript', () => {
  test('keeps the direct Free Start fallback visible', async ({ browser }, testInfo) => {
    await withNoJsPage(browser, testInfo, { width: 375, height: 812 }, async page => {
      await openFallback(page, testInfo, 'sq');
      await expectServerVisibleFallback(page);
    });
  });

  test('keeps every approved locale visible across the width matrix', async ({ browser }, info) => {
    for (const { locale, width, height } of localeViewports) {
      await withNoJsPage(browser, info, { width, height }, async page => {
        await openFallback(page, info, locale);
        await expectServerVisibleFallback(page);
      });
    }
  });

  test('keeps the vehicle hero link on the ordinary fallback without JavaScript', async ({
    browser,
  }, info) => {
    await withNoJsPage(browser, info, { width: 375, height: 812 }, async page => {
      await gotoApp(page, routes.home('sq'), info, { marker: 'public-entry-hero' });
      await page.getByTestId('public-entry-vehicle').click();
      await expect(page).toHaveURL(/#free-start-intake$/);
      await expectServerVisibleFallback(page);
      await expect(page.getByTestId('accident-safety-journey')).toHaveCount(0);
    });
  });
});
