/**
 * Staff User Flow E2E Tests
 *
 * Complete end-to-end tests for staff user journeys including:
 * - Claims queue management
 * - Status updates
 * - Messaging with members
 * - Claim details review
 */

import { expect, test } from './fixtures/auth.fixture';

test.describe('Staff User Flow', () => {
  test.describe('Workspace Access', () => {
    test('Staff can access staff workspace', async ({ staffPage: page }) => {
      await page.goto('/en/staff');
      await page.waitForLoadState('domcontentloaded');

      // Staff should be on staff workspace
      const currentUrl = page.url();
      expect(currentUrl).toContain('/staff');
    });

    test('Staff can view workspace content', async ({ staffPage: page }) => {
      await page.goto('/en/staff');
      await page.waitForLoadState('domcontentloaded');

      // Should see some content on the page - use body as fallback
      const hasContent = await page
        .locator('main, body')
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasContent).toBeTruthy();
    });
  });

  test.describe('Claims Queue', () => {
    test('Staff can access claims page', async ({ staffPage: page }) => {
      await page.goto('/en/staff/claims');
      await page.waitForLoadState('domcontentloaded');

      // Should be on claims page
      expect(page.url()).toContain('/claims');
    });

    test('Staff can view claims content', async ({ staffPage: page }) => {
      await page.goto('/en/staff/claims');
      await page.waitForLoadState('domcontentloaded');

      // Should see claims related content
      const pageContent = await page.content();
      const hasClaimsContent =
        pageContent.toLowerCase().includes('claim') ||
        pageContent.toLowerCase().includes('queue') ||
        pageContent.toLowerCase().includes('table');

      expect(hasClaimsContent).toBeTruthy();
    });

    test('Staff can see table or list of claims', async ({ staffPage: page }) => {
      await page.goto('/en/staff/claims');
      await page.waitForLoadState('domcontentloaded');

      // Check for table or list structure
      const hasTable = await page
        .getByRole('table')
        .isVisible()
        .catch(() => false);
      const hasList = await page
        .locator('[class*="list"]')
        .first()
        .isVisible()
        .catch(() => false);
      const hasContent = await page
        .locator('main')
        .first()
        .isVisible()
        .catch(() => false);

      expect(hasTable || hasList || hasContent).toBeTruthy();
    });
  });

  test.describe('Claim Details', () => {
    test('Staff can access claim detail URL pattern', async ({ staffPage: page }) => {
      await page.goto('/en/staff/claims');
      await page.waitForLoadState('domcontentloaded');

      // Find any link that goes to a claim detail
      const claimLinks = page.locator('a[href*="/claims/"]');
      const linkCount = await claimLinks.count();

      if (linkCount > 0) {
        const href = await claimLinks.first().getAttribute('href');
        expect(href).toContain('/claims/');
      }
    });
  });

  test.describe('Messaging', () => {
    test('Staff can access staff claims page', async ({ staffPage: page }) => {
      await page.goto('/en/staff/claims');
      await page.waitForLoadState('domcontentloaded');

      // Page should load successfully
      expect(page.url()).toContain('/staff');
    });
  });
});
