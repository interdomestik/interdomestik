import { expect, test } from '@playwright/test';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Smoke Tests', () => {
  test('landing page loads', async ({ page }, testInfo) => {
    await gotoApp(page, routes.home(testInfo), testInfo);
    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/Interdomestik/);
  });

  test('dashboard redirects to login when unauthenticated', async ({ browser }, testInfo) => {
    // Force a fresh context to ensure no session exists
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    // Use raw member path to trigger middleware guard
    await gotoApp(page, routes.member(testInfo), testInfo);
    await expect(page).toHaveURL(new RegExp(`.*${routes.login(testInfo)}`), { timeout: 10000 });

    await context.close();
  });
});
