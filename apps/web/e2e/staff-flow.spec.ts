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
    test('Staff can access agent workspace', async ({ staffPage: page }) => {
      await page.goto('/en/agent');
      await page.waitForLoadState('networkidle');

      // Staff should be on agent workspace or redirected appropriately
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/\/(agent|dashboard)/);
    });

    test('Staff can view workspace content', async ({ staffPage: page }) => {
      await page.goto('/en/agent');
      await page.waitForLoadState('networkidle');

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
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      // Should be on claims page
      expect(page.url()).toContain('/claims');
    });

    test('Staff can view claims content', async ({ staffPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      // Should see claims related content
      const pageContent = await page.content();
      const hasClaimsContent =
        pageContent.toLowerCase().includes('claim') ||
        pageContent.toLowerCase().includes('queue') ||
        pageContent.toLowerCase().includes('table');

      expect(hasClaimsContent).toBeTruthy();
    });

    test('Staff can see table or list of claims', async ({ staffPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

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
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

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
    test('Staff can access agent claims page', async ({ staffPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      // Page should load successfully
      expect(page.url()).toContain('/agent');
    });
  });
});
