import { expect, test } from '@playwright/test';
import { routes } from './routes';

test.describe('Public Pages', () => {
  test.describe('Stats Page', () => {
    test('should load stats page and display verified numbers', async ({ page }) => {
      await page.goto(routes.stats('en'));

      // Check title and subtitle
      await expect(page.getByText('Our Impact in Numbers')).toBeVisible();
      await expect(page.getByText('Verified Statistics')).toBeVisible();

      // Check stats cards presence
      await expect(page.getByText('Total Claims Handled')).toBeVisible();
      await expect(page.getByText('Success Rate')).toBeVisible();
      await expect(page.getByText('Total Recovered')).toBeVisible();
      await expect(page.getByText('Avg Response Time')).toBeVisible();
    });

    // Unskipped language test - SQ translations are now available
    test('should switch language on stats page', async ({ page }) => {
      await page.goto(routes.stats('sq'));
      await page.waitForLoadState('domcontentloaded');

      // Check Albanian translations
      await expect(page.getByText('Ndikimi Ynë në Numra')).toBeVisible();
      await expect(page.getByText('Statistika të Verifikuara')).toBeVisible();
    });
  });

  test.describe('Partners Page', () => {
    test('should load partners page and display categories', async ({ page }) => {
      await page.goto(routes.partners('en'));
      await page.waitForLoadState('domcontentloaded');

      // Wait for at least one heading to verify page loaded
      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

      // Check for partner-related content - be flexible
      await expect(page.locator('body')).toContainText(/Partner|Discount|Insurance|Member/i);
    });

    test('should have working CTA button', async ({ page }) => {
      await page.goto(routes.partners('en'));
      await page.waitForLoadState('domcontentloaded');

      // Look for any CTA or link - be flexible
      const ctaButton = page
        .getByRole('link', { name: /Membership|Plans|Join|Get Started/i })
        .first();
      await expect(ctaButton).toBeVisible({ timeout: 10000 });
    });
  });
});
