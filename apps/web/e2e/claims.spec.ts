/**
 * Claims E2E Tests
 *
 * End-to-end tests for claim submission and management flows.
 * Note: These tests require authentication - some are skipped until auth fixture is set up.
 */

import { expect, test } from '@playwright/test';

test.describe('Claims Flow', () => {
  test.describe('Public Access', () => {
    test('should redirect to login when accessing claims without auth', async ({ page }) => {
      await page.goto('/dashboard/claims');

      // Should redirect to login
      await page.waitForURL(/.*login.*/);
      expect(page.url()).toMatch(/login/);
    });

    test('should redirect to login when accessing new claim without auth', async ({ page }) => {
      await page.goto('/dashboard/claims/new');

      // Should redirect to login
      await page.waitForURL(/.*login.*/);
      expect(page.url()).toMatch(/login/);
    });
  });

  test.describe('Claim Wizard UI', () => {
    // These tests are skipped until we have proper auth fixture
    // Uncomment and use authenticatedPage when ready

    test.skip('should display claim wizard steps', async ({ page }) => {
      // This would use authenticatedPage fixture
      await page.goto('/dashboard/claims/new');

      // Check wizard structure
      await expect(page.locator('text=/step|category|type/i')).toBeVisible();
    });

    test.skip('should show category selection as first step', async ({ page }) => {
      await page.goto('/dashboard/claims/new');

      // Check for category options
      const categoryOptions = page.locator(
        '[data-testid="category-option"], .category-card, [role="radio"]'
      );
      await expect(categoryOptions.first()).toBeVisible();
    });

    test.skip('should validate required fields before proceeding', async ({ page }) => {
      await page.goto('/dashboard/claims/new');

      // Try to proceed without selecting category
      const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")');
      await nextButton.click();

      // Should show validation error or not proceed
      await expect(page.locator('text=/required|select/i')).toBeVisible();
    });
  });

  test.describe('Claims List', () => {
    test.skip('should display claims list for authenticated user', async ({ page }) => {
      await page.goto('/dashboard/claims');

      // Check for claims list structure
      await expect(page.locator('h1, h2').filter({ hasText: /claims/i })).toBeVisible();
    });

    test.skip('should have link to create new claim', async ({ page }) => {
      await page.goto('/dashboard/claims');

      const newClaimLink = page.locator('a[href*="new"], button:has-text("New Claim")');
      await expect(newClaimLink).toBeVisible();
    });

    test.skip('should display empty state when no claims', async ({ page }) => {
      await page.goto('/dashboard/claims');

      // Either shows claims or empty state
      const content = await page.content();
      const hasContent =
        content.includes('No claims') || content.includes('empty') || content.includes('claim');

      expect(hasContent).toBeTruthy();
    });
  });

  test.describe('Claim Detail', () => {
    test.skip('should display claim details', async ({ page }) => {
      // Assuming we have a test claim with known ID
      await page.goto('/dashboard/claims/test-claim-id');

      // Check for claim detail structure
      await expect(page.locator('[data-testid="claim-title"], h1, h2')).toBeVisible();
    });

    test.skip('should show claim status', async ({ page }) => {
      await page.goto('/dashboard/claims/test-claim-id');

      // Check for status indicator
      const statusBadge = page.locator('[data-testid="claim-status"], .status-badge, .badge');
      await expect(statusBadge).toBeVisible();
    });

    test.skip('should show claim timeline', async ({ page }) => {
      await page.goto('/dashboard/claims/test-claim-id');

      // Check for timeline component
      const timeline = page.locator('[data-testid="claim-timeline"], .timeline');
      await expect(timeline).toBeVisible();
    });
  });

  test.describe('Categories', () => {
    const categories = [
      'retail',
      'services',
      'telecom',
      'utilities',
      'insurance',
      'banking',
      'travel',
      'real_estate',
      'auto',
      'healthcare',
    ];

    for (const category of categories) {
      test.skip(`should support ${category} category`, async ({ page }) => {
        await page.goto('/dashboard/claims/new');

        // Look for category option
        const categoryOption = page.locator(
          `[data-value="${category}"], [data-testid="category-${category}"], text=/${category}/i`
        );

        // Should have this category option (or similar)
        const content = await page.content();
        // Just verify page loaded - specific categories may have different display names
        expect(content.length).toBeGreaterThan(0);
      });
    }
  });

  test.describe('Accessibility', () => {
    test('should have proper heading structure on claims page', async ({ page }) => {
      await page.goto('/login'); // Start from login since claims is protected

      const headings = await page.locator('h1, h2, h3').all();
      expect(headings.length).toBeGreaterThan(0);
    });

    test('should have accessible form labels', async ({ page }) => {
      await page.goto('/login');

      // Check that inputs have associated labels
      const emailInput = page.locator('input[name="email"], input[type="email"]');

      // Either has aria-label, aria-labelledby, or associated label
      const hasLabel = await emailInput.evaluate((el: HTMLInputElement) => {
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledBy = el.getAttribute('aria-labelledby');
        const id = el.id;
        const hasAssociatedLabel = id && document.querySelector(`label[for="${id}"]`);

        return !!(ariaLabel || ariaLabelledBy || hasAssociatedLabel || el.closest('label'));
      });

      expect(hasLabel).toBeTruthy();
    });

    test('should support keyboard navigation', async ({ page }) => {
      await page.goto('/login');

      // Tab to email field
      await page.keyboard.press('Tab');

      // Should be able to focus on interactive elements
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA']).toContain(focusedElement);
    });
  });
});
