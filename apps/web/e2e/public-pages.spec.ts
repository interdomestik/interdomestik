import { expect, test } from '@playwright/test';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Public Pages', () => {
  test.describe('Stats Page', () => {
    test('should load stats page and display verified numbers', async ({ page }, testInfo) => {
      await gotoApp(page, routes.stats(testInfo), testInfo, { marker: 'stats-page-ready' });

      await expect(page.getByTestId('stats-title')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('stats-verified-badge')).toBeVisible({ timeout: 15000 });

      // Structural checks (avoid localized strings)
      await expect(page.locator('[data-testid^="stats-card-"]')).toHaveCount(4, { timeout: 15000 });
    });

    // Unskipped language test - SQ translations are now available
    test('should switch language on stats page', async ({ page }, testInfo) => {
      await gotoApp(page, routes.stats('sq'), testInfo, { marker: 'stats-page-ready' });
      await expect(page).toHaveURL(/\/sq\/stats/, { timeout: 15000 });

      await expect(page.getByTestId('stats-title')).toHaveText('Ndikimi Ynë në Numra', {
        timeout: 15000,
      });
      await expect(page.getByTestId('stats-verified-badge')).toHaveText(
        'Statistika të Verifikuara',
        {
          timeout: 15000,
        }
      );
    });
  });

  test.describe('Partners Page', () => {
    test('should load partners page and display categories', async ({ page }, testInfo) => {
      await gotoApp(page, routes.partners(testInfo), testInfo, { marker: 'partners-page-ready' });

      await expect(page.getByTestId('partners-categories')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('[data-testid^="partners-category-"]').first()).toBeVisible({
        timeout: 15000,
      });
    });

    test('should have working CTA button', async ({ page }, testInfo) => {
      await gotoApp(page, routes.partners(testInfo), testInfo, { marker: 'partners-page-ready' });

      const ctaLink = page.getByTestId('partners-cta-link');
      await expect(ctaLink).toBeVisible({ timeout: 15000 });
      await ctaLink.click();

      await expect(page).toHaveURL(/\/pricing/, { timeout: 15000 });
      await expect(page.getByTestId('pricing-page-ready')).toBeVisible({ timeout: 15000 });
    });
  });
});
