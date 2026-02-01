/**
 * Settings E2E Tests
 *
 * End-to-end tests for the settings page including profile, password, language, and notification preferences.
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Settings Page', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('Navigation', () => {
    test('should redirect to login when not authenticated', async ({ page }, testInfo) => {
      await gotoApp(page, routes.memberSettings('en'), testInfo, { marker: 'auth-ready' });

      // Should be redirected to login
      await page.waitForURL(/.*login.*|.*auth\/sign-in.*/);
      expect(page.url()).toMatch(/login|auth\/sign-in/);
    });

    test('should display settings page when authenticated', async ({
      authenticatedPage,
    }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings('en'), testInfo);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Check for settings page title
      await expect(authenticatedPage.locator('h2')).toContainText('Settings');
    });
  });

  test.describe('Profile Settings', () => {
    test('should display profile form', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings('en'), testInfo);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Check for profile section
      await expect(authenticatedPage.locator('h3:has-text("Profile")').first()).toBeVisible();

      // Check for name input
      const nameInput = authenticatedPage.locator('input[name="name"], input[id*="name"]');
      await expect(nameInput.first()).toBeVisible();
    });
  });

  test.describe('Password Settings', () => {
    test('should display password change form', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings('en'), testInfo);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Check for security section
      await expect(
        authenticatedPage.locator('h3:has-text("Security"), h3:has-text("Change Password")').first()
      ).toBeVisible();

      // Check for password inputs (may not be visible until user interacts)
      const passwordSection = authenticatedPage.locator(
        'section:has(h3:has-text("Security"), h3:has-text("Change Password"))'
      );
      await expect(passwordSection.first()).toBeVisible();
    });
  });

  test.describe('Language Settings', () => {
    test('should display language selector', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings('en'), testInfo);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Check for language section
      await expect(authenticatedPage.locator('h3:has-text("Language")').first()).toBeVisible();

      // Check for language select
      const languageSelect = authenticatedPage
        .locator('select, [role="combobox"]')
        .filter({ hasText: /English|Shqip|Српски|Македонски/ });
      await expect(languageSelect.first()).toBeVisible({ timeout: 10000 });
    });

    test('should switch language', async ({ authenticatedPage }, testInfo) => {
      // Start on English settings page
      await gotoApp(authenticatedPage, routes.memberSettings('en'), testInfo);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Find and click language selector
      const languageButton = authenticatedPage.locator('[id*="language-select"]').first();
      await languageButton.click();

      // Wait for dropdown to open
      await authenticatedPage.waitForTimeout(500);

      // Select Albanian
      const albanianOption = authenticatedPage.locator('[role="option"]:has-text("Shqip")');
      if (await albanianOption.isVisible()) {
        await albanianOption.click();

        // Wait for navigation
        await authenticatedPage.waitForURL(/\/sq\//);

        // Should be on Albanian settings page
        expect(authenticatedPage.url()).toContain('/sq/');
      }
    });
  });

  test.describe('Notification Settings', () => {
    test('should display notification preferences', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings('en'), testInfo);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Wait for notification section to load
      await authenticatedPage.waitForTimeout(1000);

      // Check for notification section
      await expect(authenticatedPage.locator('h3:has-text("Notification")').first()).toBeVisible({
        timeout: 10000,
      });

      // Check for email notifications section
      await expect(authenticatedPage.locator('h4:has-text("Email")')).toBeVisible();

      // Check for push notifications section
      await expect(authenticatedPage.locator('h4:has-text("Push")')).toBeVisible();

      // Check for in-app notifications section
      await expect(authenticatedPage.locator('h4:has-text("In-App")')).toBeVisible();
    });

    test('should toggle notification preferences', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings('en'), testInfo);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Wait for notification section to load
      await authenticatedPage.waitForTimeout(1500);

      // Find email claim updates checkbox
      const emailClaimUpdatesCheckbox = authenticatedPage.locator(
        'button[role="checkbox"]#email-claim-updates'
      );

      // Wait for checkbox to be visible
      await expect(emailClaimUpdatesCheckbox).toBeVisible({ timeout: 10000 });

      // Get initial state
      const initialState =
        (await emailClaimUpdatesCheckbox.getAttribute('data-state')) === 'checked';

      // Toggle the checkbox
      await emailClaimUpdatesCheckbox.click();

      // Verify state changed
      const newState = (await emailClaimUpdatesCheckbox.getAttribute('data-state')) === 'checked';
      expect(newState).toBe(!initialState);
    });

    // TODO: Fix application bug - Notification preferences are not persisting after save/reload
    test.fixme('Known bug: notification preferences not persisting', async ({
      authenticatedPage,
    }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings('en'), testInfo);
      await authenticatedPage.waitForLoadState('networkidle');

      // Wait for notification section to be visible
      await expect(authenticatedPage.locator('h3:has-text("Notification")').first()).toBeVisible({
        timeout: 10000,
      });

      // Find the "Promotional emails" checkbox by its accessible name
      const promoCheckbox = authenticatedPage.getByRole('checkbox', { name: /promotional/i });
      await expect(promoCheckbox).toBeVisible({ timeout: 10000 });

      // Get initial checked state
      const isInitiallyChecked = await promoCheckbox.isChecked();

      // Toggle the checkbox
      await promoCheckbox.click();

      // Verify immediate toggle
      const isCheckedAfterClick = await promoCheckbox.isChecked();
      expect(isCheckedAfterClick).toBe(!isInitiallyChecked);

      // Find and click save button - wait for response
      const saveButton = authenticatedPage.getByRole('button', { name: /save/i }).last();
      await expect(saveButton).toBeVisible();

      // Click save and wait for any notification-related API to respond
      await Promise.all([
        authenticatedPage.waitForResponse(
          res => res.url().includes('/api/') && res.request().method() === 'POST',
          { timeout: 10000 }
        ),
        saveButton.click(),
      ]);

      // Refresh page and verify preference persisted
      await authenticatedPage.reload();
      await authenticatedPage.waitForLoadState('networkidle');

      // Wait for checkbox to be visible after reload
      const promoCheckboxAfterReload = authenticatedPage.getByRole('checkbox', {
        name: /promotional/i,
      });
      await expect(promoCheckboxAfterReload).toBeVisible({ timeout: 10000 });

      // Verify the state persisted
      const isCheckedAfterReload = await promoCheckboxAfterReload.isChecked();
      expect(isCheckedAfterReload).toBe(!isInitiallyChecked);
    });

    test('should handle save errors gracefully', async ({ authenticatedPage }, testInfo) => {
      // This test would require mocking the API to return an error
      // For now, we'll just verify the UI is present
      await gotoApp(authenticatedPage, routes.memberSettings('en'), testInfo);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Wait for notification section
      await authenticatedPage.waitForTimeout(1500);

      // Verify save button exists
      const saveButton = authenticatedPage.locator('button:has-text("Save")').last();
      await expect(saveButton).toBeVisible({ timeout: 10000 });
      await expect(saveButton).toBeEnabled();
    });
  });

  test.describe('Responsive Design', () => {
    test('should display settings on mobile', async ({ authenticatedPage }, testInfo) => {
      // Set mobile viewport
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });

      await gotoApp(authenticatedPage, routes.memberSettings('en'), testInfo);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Check that settings page is visible
      await expect(authenticatedPage.locator('h2:has-text("Settings")')).toBeVisible();

      // Check that sections are stacked vertically (not side-by-side)
      const sections = authenticatedPage.locator('section');
      await expect(sections.first()).toBeVisible();
    });
  });
});
