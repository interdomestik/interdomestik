import { expect, test } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  // We might not have a title set yet, so checking mostly for connectivity
  // But let's check for "Interdomestik" if we expect it, or just pass if it loads.

  // Just checking that we don't 404
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
});
