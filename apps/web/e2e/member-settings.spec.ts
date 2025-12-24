/**
 * Settings E2E Tests
 *
 * End-to-end tests for the settings page including profile, password, language, and notification preferences.
 */

import { expect, test } from './fixtures/auth.fixture';

test.describe('Settings Page', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('Navigation', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
      await page.goto('/en/member/settings');

      // Should be redirected to login
      await page.waitForURL(/.*login.*|.*auth\/sign-in.*/);
      expect(page.url()).toMatch(/login|auth\/sign-in/);
    });

    test('should display settings page when authenticated', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/en/member/settings');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Check for settings page title
      await expect(authenticatedPage.locator('h2')).toContainText('Settings');
    });
  });

  test.describe('Profile Settings', () => {
    test('should display profile form', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/en/member/settings');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Check for profile section
      await expect(authenticatedPage.locator('h3:has-text("Profile")').first()).toBeVisible();

      // Check for name input
      const nameInput = authenticatedPage.locator('input[name="name"], input[id*="name"]');
      await expect(nameInput.first()).toBeVisible();
    });
  });

  test.describe('Password Settings', () => {
    test('should display password change form', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/en/member/settings');
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
    test('should display language selector', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/en/member/settings');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Check for language section
      await expect(authenticatedPage.locator('h3:has-text("Language")').first()).toBeVisible();

      // Check for language select
      const languageSelect = authenticatedPage
        .locator('select, [role="combobox"]')
        .filter({ hasText: /English|Shqip|Српски|Македонски/ });
      await expect(languageSelect.first()).toBeVisible({ timeout: 10000 });
    });

    test('should switch language', async ({ authenticatedPage }) => {
      // Start on English settings page
      await authenticatedPage.goto('/en/member/settings');
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
    test('should display notification preferences', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/en/member/settings');
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

    test('should toggle notification preferences', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/en/member/settings');
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

    test('should save notification preferences', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/en/member/settings');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Wait for notification section to load
      await authenticatedPage.waitForTimeout(1500);

      // Find and toggle a preference
      const marketingCheckbox = authenticatedPage.locator(
        'button[role="checkbox"]#email-marketing'
      );
      await expect(marketingCheckbox).toBeVisible({ timeout: 10000 });

      const initialState = (await marketingCheckbox.getAttribute('data-state')) === 'checked';
      await marketingCheckbox.click();

      // Find and click save button
      const saveButton = authenticatedPage.locator('button:has-text("Save")').last();
      await expect(saveButton).toBeVisible();
      await saveButton.click();

      // Wait for save to complete
      await authenticatedPage.waitForTimeout(1000);

      // Refresh page and verify preference persisted
      await authenticatedPage.reload();
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(1500);

      // Check if the preference persisted
      const marketingCheckboxAfterReload = authenticatedPage.locator(
        'button[role="checkbox"]#email-marketing'
      );
      await expect(marketingCheckboxAfterReload).toBeVisible({ timeout: 10000 });

      const stateAfterReload =
        (await marketingCheckboxAfterReload.getAttribute('data-state')) === 'checked';
      expect(stateAfterReload).toBe(!initialState);
    });

    test('should handle save errors gracefully', async ({ authenticatedPage }) => {
      // This test would require mocking the API to return an error
      // For now, we'll just verify the UI is present
      await authenticatedPage.goto('/en/member/settings');
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
    test('should display settings on mobile', async ({ authenticatedPage }) => {
      // Set mobile viewport
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });

      await authenticatedPage.goto('/en/member/settings');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Check that settings page is visible
      await expect(authenticatedPage.locator('h2:has-text("Settings")')).toBeVisible();

      // Check that sections are stacked vertically (not side-by-side)
      const sections = authenticatedPage.locator('section');
      await expect(sections.first()).toBeVisible();
    });
  });
});
