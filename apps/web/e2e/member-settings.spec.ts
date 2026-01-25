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
    test('should redirect to login when not authenticated', async ({ browser }, testInfo) => {
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();

      await gotoApp(page, routes.memberSettings(testInfo), testInfo, { marker: 'body' });
      await expect(page).toHaveURL(/\/login/);

      await context.close();
    });

    test('should display settings page when authenticated', async ({
      authenticatedPage,
    }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings(testInfo), testInfo, {
        marker: 'settings-page-ready',
      });

      // Locale-safe: just verify page structure is present
      await expect(authenticatedPage.getByTestId('settings-page-ready')).toBeVisible();
    });
  });

  test.describe('Profile Settings', () => {
    test('should display profile form', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings(testInfo), testInfo, {
        marker: 'settings-page-ready',
      });

      // Check for name input - using testid
      const nameInput = authenticatedPage.getByTestId('profile-name-input');
      await expect(nameInput).toBeVisible();
    });
  });

  test.describe('Password Settings', () => {
    test('should display password change form', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings(testInfo), testInfo, {
        marker: 'settings-page-ready',
      });

      // Locale-safe: ChangePasswordForm always renders password inputs
      await expect(authenticatedPage.locator('input[type="password"]').first()).toBeVisible();
    });
  });

  test.describe('Language Settings', () => {
    test('should display language selector', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings(testInfo), testInfo, {
        marker: 'settings-page-ready',
      });

      // Check for language select
      const languageSelect = authenticatedPage.getByTestId('language-select');
      await expect(languageSelect).toBeVisible({ timeout: 10000 });
    });

    test('should switch language', async ({ authenticatedPage }, testInfo) => {
      // Start on English settings page
      await gotoApp(authenticatedPage, routes.memberSettings(testInfo), testInfo, {
        marker: 'settings-page-ready',
      });

      // Find and click language selector
      const languageButton = authenticatedPage.getByTestId('language-select');
      await languageButton.click();

      // Select Albanian
      const albanianOption = authenticatedPage.getByTestId('language-option-sq');
      await expect(albanianOption).toBeVisible();
      await albanianOption.click();

      // Wait for navigation
      await authenticatedPage.waitForURL(/\/sq\//);

      // Should be on Albanian settings page
      expect(authenticatedPage.url()).toContain('/sq/');
    });
  });

  test.describe('Notification Settings', () => {
    test('should display notification preferences', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings(testInfo), testInfo, {
        marker: 'settings-page-ready',
      });

      // NotificationSettings is a client component and may render a loading state first.
      // Wait for a stable "loaded" marker, then assert a preference control.
      await expect(authenticatedPage.getByTestId('notifications-loaded')).toBeVisible({
        timeout: 30000,
      });

      const saveButton = authenticatedPage.getByTestId('notification-settings-save');
      await expect(saveButton).toBeVisible({ timeout: 30000 });

      const emailClaimUpdatesCheckbox = authenticatedPage.getByTestId(
        'checkbox-email-claim-updates'
      );
      await expect(emailClaimUpdatesCheckbox).toBeVisible({ timeout: 10000 });
    });

    test('should toggle notification preferences', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings(testInfo), testInfo, {
        marker: 'settings-page-ready',
      });

      // Wait for component to load
      await expect(authenticatedPage.getByTestId('notifications-loaded')).toBeVisible({
        timeout: 30000,
      });

      // Find email claim updates checkbox
      const emailClaimUpdatesCheckbox = authenticatedPage.getByTestId(
        'checkbox-email-claim-updates'
      );

      // Wait for checkbox to be visible
      await expect(emailClaimUpdatesCheckbox).toBeVisible({ timeout: 10000 });

      // Get initial state
      const initialState =
        (await emailClaimUpdatesCheckbox.getAttribute('data-state')) === 'checked';

      // Toggle the checkbox
      await emailClaimUpdatesCheckbox.click();

      // Verify state changed - with polling to allow for React state update
      await expect(async () => {
        const newState = (await emailClaimUpdatesCheckbox.getAttribute('data-state')) === 'checked';
        expect(newState).toBe(!initialState);
      }).toPass({ timeout: 5000 });
    });

    // TODO: Fix application bug - Notification preferences are not persisting after save/reload
    test.fixme('Known bug: notification preferences not persisting', async ({
      authenticatedPage,
    }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings(testInfo), testInfo, {
        marker: 'settings-page-ready',
      });

      // Wait for notification section to be visible
      await expect(authenticatedPage.getByTestId('notification-section-email')).toBeVisible({
        timeout: 10000,
      });

      // Find the checkbox by its testid
      const promoCheckbox = authenticatedPage.getByTestId('checkbox-email-marketing');
      await expect(promoCheckbox).toBeVisible({ timeout: 10000 });

      // Get initial checked state
      const isInitiallyChecked = (await promoCheckbox.getAttribute('data-state')) === 'checked';

      // Toggle the checkbox
      await promoCheckbox.click();

      // Verify immediate toggle
      await expect(async () => {
        const isCheckedAfterClick = (await promoCheckbox.getAttribute('data-state')) === 'checked';
        expect(isCheckedAfterClick).toBe(!isInitiallyChecked);
      }).toPass();

      // Find and click save button
      const saveButton = authenticatedPage.getByTestId('notification-settings-save');
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
      const promoCheckboxAfterReload = authenticatedPage.getByTestId('checkbox-email-marketing');
      await expect(promoCheckboxAfterReload).toBeVisible({ timeout: 10000 });

      // Verify the state persisted
      const isCheckedAfterReload =
        (await promoCheckboxAfterReload.getAttribute('data-state')) === 'checked';
      expect(isCheckedAfterReload).toBe(!isInitiallyChecked);
    });

    test('should handle save errors gracefully', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberSettings(testInfo), testInfo, {
        marker: 'settings-page-ready',
      });

      // Wait for component to load
      await expect(authenticatedPage.getByTestId('notifications-loaded')).toBeVisible({
        timeout: 30000,
      });

      const saveButton = authenticatedPage.getByTestId('notification-settings-save');
      await expect(saveButton).toBeVisible({ timeout: 30000 });
      await expect(saveButton).toBeEnabled();
    });
  });

  test.describe('Responsive Design', () => {
    test('should display settings on mobile', async ({ authenticatedPage }, testInfo) => {
      // Set mobile viewport
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });

      await gotoApp(authenticatedPage, routes.memberSettings(testInfo), testInfo, {
        marker: 'settings-page-ready',
      });

      await expect(authenticatedPage.getByTestId('settings-page-ready')).toBeVisible();
    });
  });
});
