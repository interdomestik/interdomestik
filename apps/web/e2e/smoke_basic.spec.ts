import { expect, test } from '@playwright/test';
import { routes } from './routes';

test.describe('Smoke Tests', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto(routes.home());
    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/Interdomestik/);
  });

  // Skipped until we configure auth fixture
  test('dashboard redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(routes.member());
    await expect(page).toHaveURL(/.*login/);
  });
});
