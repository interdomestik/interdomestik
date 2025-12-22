/**
 * Agent User Flow E2E Tests
 *
 * Complete end-to-end tests for agent user journeys including:
 * - Claims queue access with limited actions
 * - View-only claim access
 * - Access control verification
 */

import { expect, test } from './fixtures/auth.fixture';

test.describe('Agent User Flow', () => {
  test.describe('Claims Access', () => {
    test('Agent can access claims queue', async ({ agentPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      // Should see claims queue or be on agent page
      expect(page.url()).toContain('/agent');
    });

    test('Agent claims page loads content', async ({ agentPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      // Should see some content
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });

    test('Agent sees View Status action (not Review Case)', async ({ agentPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      // Agent should NOT see "Review Case" - only staff/admin do
      const reviewCaseVisible = await page
        .getByRole('link', { name: /Review Case/i })
        .isVisible()
        .catch(() => false);

      expect(reviewCaseVisible).toBeFalsy();
    });
  });

  test.describe('Limited Actions', () => {
    test('Agent has restricted claim actions', async ({ agentPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      // Agent should not see edit/manage controls
      const hasEditButton = await page
        .getByRole('button', { name: /Edit|Manage|Delete/i })
        .isVisible()
        .catch(() => false);

      // Agent typically only views, no management actions
      expect(hasEditButton).toBeFalsy();
    });
  });

  test.describe('Access Control', () => {
    test('Agent is denied access to admin routes', async ({ agentPage: page }) => {
      await page.goto('/en/admin');
      await page.waitForLoadState('networkidle');

      // Agent should be redirected away from admin
      const currentUrl = page.url();
      expect(currentUrl).not.toMatch(/\/admin$/);
    });

    test('Agent is denied access to admin user management', async ({ agentPage: page }) => {
      await page.goto('/en/admin/users');
      await page.waitForLoadState('networkidle');

      // Should be redirected
      expect(page.url()).not.toContain('/admin/users');
    });

    test('Agent can access their workspace', async ({ agentPage: page }) => {
      await page.goto('/en/agent');
      await page.waitForLoadState('networkidle');

      // Agent should have access to agent workspace
      const isOnAllowedPage = page.url().includes('/dashboard') || page.url().includes('/agent');

      expect(isOnAllowedPage).toBeTruthy();
    });
  });

  test.describe('Navigation', () => {
    test('Agent can navigate to claims', async ({ agentPage: page }) => {
      await page.goto('/en/agent/claims');
      await page.waitForLoadState('networkidle');

      // Should be on claims page
      expect(page.url()).toContain('/claims');
    });

    test('Agent page has navigation elements', async ({ agentPage: page }) => {
      await page.goto('/en/agent');
      await page.waitForLoadState('networkidle');

      // Should have some navigation
      const hasNav = await page
        .locator('nav')
        .first()
        .isVisible()
        .catch(() => false);
      const hasSidebar = await page
        .locator('[class*="sidebar"]')
        .first()
        .isVisible()
        .catch(() => false);
      const hasLinks = await page
        .getByRole('link')
        .first()
        .isVisible()
        .catch(() => false);

      expect(hasNav || hasSidebar || hasLinks).toBeTruthy();
    });
  });
});
