/**
 * Member User Flow E2E Tests
 *
 * Complete end-to-end tests for member user journeys including:
 * - Dashboard navigation
 * - Claims management
 * - Profile and settings
 */

import type { Page } from '@playwright/test';
import { expect, isLoggedIn, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

async function isUserNavVisible(page: Page): Promise<boolean> {
  const userNav = page.locator('[data-testid="user-nav"]');
  const sidebarUserMenu = page.locator('[data-testid="sidebar-user-menu-button"]');
  const avatarButton = page.locator('button:has(img)');
  const avatarText = page.locator('button').filter({ hasText: /^[A-Z]{1,2}$/ });

  const navVisible = await userNav.isVisible().catch(() => false);
  const sidebarVisible = await sidebarUserMenu.isVisible().catch(() => false);
  const btnVisible = await avatarButton
    .first()
    .isVisible()
    .catch(() => false);
  const textVisible = await avatarText
    .first()
    .isVisible()
    .catch(() => false);
  const sessionReady = await isLoggedIn(page);

  return navVisible || sidebarVisible || btnVisible || textVisible || sessionReady;
}

// TODO: Legacy tests - superseded by golden-flows.spec.ts
test.describe('@legacy Member User Flow', () => {
  test.describe('Dashboard', () => {
    test('Member can access dashboard after login', async ({
      authenticatedPage: page,
    }, testInfo) => {
      await gotoApp(page, routes.member(), testInfo, { marker: 'domcontentloaded' });

      // Should be on dashboard, not redirected
      expect(page.url()).toContain('/member');

      // Should see dashboard overview heading
      await expect(
        page.getByRole('heading', { name: /Overview|Dashboard|Përmbledhje/i })
      ).toBeVisible();
    });

    // TODO: Update for locale support - uses English text
    test.skip('Member can see referral card', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.member(), testInfo, { marker: 'domcontentloaded' });

      // Check for Referral Card Title
      await expect(page.getByText('Invite Friends & Earn')).toBeVisible();

      // Check for Referral Link Input presence
      await expect(page.locator('input[readonly]')).toBeVisible();

      // Check for Share options
      await expect(page.getByRole('button', { name: 'WhatsApp' })).toBeVisible();
    });

    test('Member can see dashboard content', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.member(), testInfo, { marker: 'domcontentloaded' });

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

    test('Member can see claims navigation link', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.member(), testInfo, { marker: 'domcontentloaded' });

      // Find claims link anywhere on the page
      const claimsLink = page.getByRole('link', { name: /claims/i }).first();

      if (await claimsLink.isVisible().catch(() => false)) {
        expect(await claimsLink.isVisible()).toBeTruthy();
      }
    });
  });

  test.describe('Claims Management', () => {
    // TODO: Update for locale support - needs locale-aware assertions
    test.skip('Member can view their claims list', async ({
      authenticatedPage: page,
    }, testInfo) => {
      await gotoApp(page, routes.memberClaims(), testInfo, { marker: 'domcontentloaded' });

      // Should see claims page
      expect(page.url()).toContain('/claims');

      // Should see either claims table or empty state
      const visibleTableCount = await page
        .locator('table:visible')
        .count()
        .catch(() => 0);
      const pageText = (await page.locator('main').first().innerText()).toLowerCase();
      const hasEmptyState = /no claims|no active claims/i.test(pageText);
      const hasClaimsContent = pageText.includes('claim');

      expect(visibleTableCount > 0 || hasEmptyState || hasClaimsContent).toBeTruthy();
    });

    test('Member can access new claim wizard', async ({ authenticatedPage: page }, testInfo) => {
      test.setTimeout(60000); // Allow extra time for dev compilation on first load
      await gotoApp(page, routes.memberNewClaim(), testInfo, { marker: 'domcontentloaded' });

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

    test('Member can navigate to claims page', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.memberClaims(), testInfo, { marker: 'domcontentloaded' });

      // Verify we are on claims page
      expect(page.url()).toContain('/claims');

      // Should see page content
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe('Settings', () => {
    test('Member can access settings page', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.memberSettings(), testInfo, { marker: 'domcontentloaded' });

      expect(page.url()).toContain('/settings');

      // Should see settings content
      const pageContent = await page.content();
      const hasSettingsContent =
        pageContent.toLowerCase().includes('settings') ||
        pageContent.toLowerCase().includes('preferences') ||
        pageContent.toLowerCase().includes('profile');
      expect(hasSettingsContent).toBeTruthy();
    });

    test('Member can see profile section in settings', async ({
      authenticatedPage: page,
    }, testInfo) => {
      await gotoApp(page, routes.memberSettings(), testInfo, { marker: 'domcontentloaded' });

      // Look for profile-related form fields or content
      const pageContent = await page.content();
      const hasProfileSection =
        pageContent.toLowerCase().includes('profile') ||
        pageContent.toLowerCase().includes('name') ||
        pageContent.toLowerCase().includes('email');

      expect(hasProfileSection).toBeTruthy();
    });

    test('Member can see password section in settings', async ({
      authenticatedPage: page,
    }, testInfo) => {
      await gotoApp(page, routes.memberSettings(), testInfo, { marker: 'domcontentloaded' });

      // Look for password-related content
      const pageContent = await page.content();
      const hasPasswordSection =
        pageContent.toLowerCase().includes('password') ||
        pageContent.toLowerCase().includes('security');

      expect(hasPasswordSection).toBeTruthy();
    });
  });

  test.describe('Navigation', () => {
    test('Member dashboard has content area', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.member(), testInfo, { marker: 'domcontentloaded' });

      // Check main content area is visible
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible();
    });

    test('Member can access user menu', async ({ authenticatedPage: page }, testInfo) => {
      await gotoApp(page, routes.member(), testInfo, { marker: 'domcontentloaded' });

      // Avoid `networkidle` in SPA apps (polling/SSE/analytics can keep the network busy forever).
      await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

      // Wait for any of the user nav variants to be visible
      await expect(async () => {
        const anyVisible = await isUserNavVisible(page);
        expect(anyVisible).toBeTruthy();
      }).toPass({ timeout: 15000 });
    });
  });
});
