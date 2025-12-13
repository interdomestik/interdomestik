import { expect, test } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/Interdomestik/);
  });

  // Skipped until we configure auth fixture
  test.skip('dashboard redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*login/);
  });
});
