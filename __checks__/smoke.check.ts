import { expect, test } from '@playwright/test';

export const smokeCheck = test('Smoke Check', async ({ page }) => {
  const targetUrl = process.env.ENVIRONMENT_URL || 'http://localhost:3000';
  const response = await page.goto(targetUrl);

  if (!response) {
    throw new Error(`Failed to navigate to ${targetUrl}`);
  }

  expect(response.status()).toBeLessThan(400);

  // Basic sanity check
  await expect(page).toHaveTitle(/Interdomestik/);
});
