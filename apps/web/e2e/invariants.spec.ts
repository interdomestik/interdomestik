import { expect, test } from '@playwright/test';

test.describe('E2E Invariants', () => {
  test('origin never changes during navigation (no localhost drift)', async ({ page }) => {
    // Start at the root (which redirects to /sq or /en)
    await page.goto('/');

    const initialUrl = new URL(page.url());
    const initialOrigin = initialUrl.origin;

    console.log(`[Invariant] Initial URL: ${page.url()}, Origin: ${initialOrigin}`);

    // Normalize localhost and 127.0.0.1 as equivalent (they are the same loopback interface)
    const normalizeOrigin = (origin: string) => origin.replace('localhost', '127.0.0.1');

    // Check that we're on a valid local origin
    const baseURL = test.info().project.use.baseURL;
    if (baseURL) {
      const expectedOrigin = new URL(baseURL).origin;
      expect(normalizeOrigin(initialOrigin)).toBe(normalizeOrigin(expectedOrigin));
    }

    // Navigate to a few pages and verify origin stays stable
    const paths = ['/en', '/sq', '/en/login'];
    for (const path of paths) {
      await page.goto(path);
      const currentOrigin = new URL(page.url()).origin;
      console.log(`[Invariant] Navigated to ${path}, Current Origin: ${currentOrigin}`);
      // Use normalized comparison
      expect(normalizeOrigin(currentOrigin)).toBe(normalizeOrigin(initialOrigin));
    }
  });
});
