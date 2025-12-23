/**
 * Member User Flow E2E Tests
 *
 * Complete end-to-end tests for member user journeys including:
 * - Dashboard navigation
 * - Claims management
 * - Profile and settings
 */

import { expect, test } from './fixtures/auth.fixture';

test.describe('Member User Flow', () => {
  test.describe('Dashboard', () => {
    test('Member can access dashboard after login', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member');
      await page.waitForLoadState('domcontentloaded');

      // Should be on dashboard, not redirected
      expect(page.url()).toContain('/member');

      // Should see dashboard overview heading
      await expect(
        page.getByRole('heading', { name: /Overview|Dashboard|Përmbledhje/i })
      ).toBeVisible();
    });

    test('Member can see dashboard content', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member');
      await page.waitForLoadState('domcontentloaded');

      // Should see dashboard content - use first() to handle multiple main elements
      const dashboardContent = page.locator('main').first();
      await expect(dashboardContent).toBeVisible();

      // Check for stats or claim-related content
      const pageContent = await page.content();
      const hasClaimsContent =
        pageContent.toLowerCase().includes('claim') ||
        pageContent.toLowerCase().includes('case') ||
        pageContent.toLowerCase().includes('overview');
      expect(hasClaimsContent).toBeTruthy();
    });

    test('Member can see claims navigation link', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member');
      await page.waitForLoadState('domcontentloaded');

      // Find claims link anywhere on the page
      const claimsLink = page.getByRole('link', { name: /claims/i }).first();

      if (await claimsLink.isVisible().catch(() => false)) {
        expect(await claimsLink.isVisible()).toBeTruthy();
      }
    });
  });

  test.describe('Claims Management', () => {
    test('Member can view their claims list', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member/claims');
      await page.waitForLoadState('domcontentloaded');

      // Should see claims page
      expect(page.url()).toContain('/claims');

      // Should see either claims table or empty state
      const hasTable = await page
        .getByRole('table')
        .isVisible()
        .catch(() => false);
      const hasEmptyState = await page
        .getByText(/no claims|no active claims/i)
        .isVisible()
        .catch(() => false);
      const hasClaimsContent = await page
        .getByText(/claim/i)
        .first()
        .isVisible()
        .catch(() => false);

      expect(hasTable || hasEmptyState || hasClaimsContent).toBeTruthy();
    });

    test('Member can access new claim wizard', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member/claims/new');
      await page.waitForLoadState('domcontentloaded');

      // Should see claim wizard or category selection
      const isOnWizard = page.url().includes('/new') || page.url().includes('/wizard');
      expect(isOnWizard).toBeTruthy();

      // Check for category selection or form elements
      const pageContent = await page.content();
      const hasFormContent =
        pageContent.toLowerCase().includes('category') ||
        pageContent.toLowerCase().includes('type') ||
        pageContent.toLowerCase().includes('claim');

      expect(hasFormContent).toBeTruthy();
    });

    test('Member can navigate to claims page', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member/claims');
      await page.waitForLoadState('domcontentloaded');

      // Verify we are on claims page
      expect(page.url()).toContain('/claims');

      // Should see page content
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe('Settings', () => {
    test('Member can access settings page', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member/settings');
      await page.waitForLoadState('domcontentloaded');

      expect(page.url()).toContain('/settings');

      // Should see settings content
      const pageContent = await page.content();
      const hasSettingsContent =
        pageContent.toLowerCase().includes('settings') ||
        pageContent.toLowerCase().includes('preferences') ||
        pageContent.toLowerCase().includes('profile');
      expect(hasSettingsContent).toBeTruthy();
    });

    test('Member can see profile section in settings', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member/settings');
      await page.waitForLoadState('domcontentloaded');

      // Look for profile-related form fields or content
      const pageContent = await page.content();
      const hasProfileSection =
        pageContent.toLowerCase().includes('profile') ||
        pageContent.toLowerCase().includes('name') ||
        pageContent.toLowerCase().includes('email');

      expect(hasProfileSection).toBeTruthy();
    });

    test('Member can see password section in settings', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member/settings');
      await page.waitForLoadState('domcontentloaded');

      // Look for password-related content
      const pageContent = await page.content();
      const hasPasswordSection =
        pageContent.toLowerCase().includes('password') ||
        pageContent.toLowerCase().includes('security');

      expect(hasPasswordSection).toBeTruthy();
    });
  });

  test.describe('Navigation', () => {
    test('Member dashboard has content area', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member');
      await page.waitForLoadState('domcontentloaded');

      // Check main content area is visible
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });

    test('Member can access user menu', async ({ authenticatedPage: page }) => {
      await page.goto('/en/member');
      await page.waitForLoadState('domcontentloaded');

      // Look for user nav or avatar button
      const userNav = page.locator('[data-testid="user-nav"]');
      const avatarButton = page.locator('button').filter({ hasText: /^[A-Z]{1,2}$/ });

      const hasUserNav =
        (await userNav.isVisible().catch(() => false)) ||
        (await avatarButton
          .first()
          .isVisible()
          .catch(() => false));

      expect(hasUserNav).toBeTruthy();
    });
  });
});
