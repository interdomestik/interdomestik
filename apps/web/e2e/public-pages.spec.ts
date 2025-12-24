import { expect, test } from '@playwright/test';

test.describe('Public Pages', () => {
  test.describe('Stats Page', () => {
    test('should load stats page and display verified numbers', async ({ page }) => {
      await page.goto('/en/stats');

      // Check title and subtitle
      await expect(page.getByText('Our Impact in Numbers')).toBeVisible();
      await expect(page.getByText('Verified Statistics')).toBeVisible();

      // Check stats cards presence
      await expect(page.getByText('Total Claims Handled')).toBeVisible();
      await expect(page.getByText('Success Rate')).toBeVisible();
      await expect(page.getByText('Total Recovered')).toBeVisible();
      await expect(page.getByText('Avg Response Time')).toBeVisible();
    });

    test('should switch language on stats page', async ({ page }) => {
      await page.goto('/sq/stats');

      // Check Albanian translations
      await expect(page.getByText('Ndikimi Ynë në Numra')).toBeVisible();
      await expect(page.getByText('Statistika të Verifikuara')).toBeVisible();
    });
  });

  test.describe('Partners Page', () => {
    test('should load partners page and display categories', async ({ page }) => {
      await page.goto('/en/partners');

      // Wait for at least one category header
      await expect(page.locator('h2').first()).toBeVisible();

      // Check title
      await expect(page.getByText('Partner Discounts')).toBeVisible();
      await expect(page.getByText('Member Exclusive')).toBeVisible();

      // Check categories - use more specific locator if possible, or relax exactness
      // Wait for partner grid
      await expect(page.locator('.grid').first()).toBeVisible();

      await expect(page.locator('body')).toContainText('Insurance');
      await expect(page.locator('body')).toContainText('Legal Services');
      await expect(page.locator('body')).toContainText('Automotive');

      // Check for a specific partner
      await expect(page.locator('body')).toContainText('Sigal');
      await expect(page.locator('body')).toContainText('15%');
    });

    test('should have working CTA button', async ({ page }) => {
      await page.goto('/en/partners');

      const ctaButton = page.getByRole('link', { name: 'View Membership Plans' });
      await expect(ctaButton).toBeVisible();
      await expect(ctaButton).toHaveAttribute('href', '/pricing');
    });
  });
});
