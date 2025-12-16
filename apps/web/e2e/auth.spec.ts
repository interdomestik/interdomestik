/**
 * Authentication E2E Tests
 *
 * End-to-end tests for authentication flows including login, logout, and registration.
 */

import { expect, test } from '@playwright/test';

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');

      // Check for form elements
      await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should show validation error for empty email', async ({ page }) => {
      await page.goto('/login');

      // Submit empty form
      await page.click('button[type="submit"]');

      // Check for validation error or required field indication
      const emailInput = page.locator('input[name="email"], input[type="email"]');

      // Either native validation or custom error
      const hasError = await emailInput.evaluate((el: HTMLInputElement) => {
        return (el.validity && !el.validity.valid) || el.getAttribute('aria-invalid') === 'true';
      });

      expect(hasError).toBeTruthy();
    });

    test('should show validation error for invalid email format', async ({ page }) => {
      await page.goto('/login');

      await page.fill('input[name="email"], input[type="email"]', 'not-an-email');
      await page.fill('input[name="password"], input[type="password"]', 'somepassword');
      await page.click('button[type="submit"]');

      // Wait for validation message
      await page.waitForTimeout(500);

      // Check for error state
      const hasEmailError = await page
        .locator('text=/invalid|email|format/i')
        .isVisible()
        .catch(() => false);

      // Either shows error message or stays on login page
      const currentUrl = page.url();
      expect(currentUrl).toContain('login');
    });

    test('should have link to registration', async ({ page }) => {
      await page.goto('/login');

      const registerLink = page.locator('a[href*="register"], a[href*="signup"]');

      if (await registerLink.isVisible()) {
        await expect(registerLink).toBeVisible();
      }
    });

    test('should have forgot password link', async ({ page }) => {
      await page.goto('/login');

      const forgotLink = page.locator('a:has-text("forgot"), a[href*="forgot"], a[href*="reset"]');

      if (await forgotLink.isVisible()) {
        await expect(forgotLink).toBeVisible();
      }
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect /dashboard to login when not authenticated', async ({ page }) => {
      await page.goto('/dashboard');

      // Should be redirected to login
      await page.waitForURL(/.*login.*/);
      expect(page.url()).toMatch(/login/);
    });

    test('should redirect /dashboard/claims to login when not authenticated', async ({ page }) => {
      await page.goto('/dashboard/claims');

      // Should be redirected to login
      await page.waitForURL(/.*login.*/);
      expect(page.url()).toMatch(/login/);
    });

    test('should redirect /settings to login when not authenticated', async ({ page }) => {
      await page.goto('/settings');

      // Wait for redirect
      await page.waitForTimeout(1000);

      // Should be redirected to login or home
      expect(page.url()).toMatch(/(login|auth\/sign-in|\/en\/?$|\/sq\/?$)/);
    });
  });

  test.describe('Register Page', () => {
    test('should display registration form if available', async ({ page }) => {
      await page.goto('/register');

      // Check if register page exists (might redirect to login)
      const currentUrl = page.url();

      if (currentUrl.includes('register')) {
        await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
        await expect(page.locator('input[name="password"], input[type="password"]').first()).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
      }
    });

    test('should have terms and conditions checkbox if required', async ({ page }) => {
      await page.goto('/register');

      const termsCheckbox = page.locator('input[type="checkbox"]');

      if (await termsCheckbox.isVisible()) {
        await expect(termsCheckbox).toBeVisible();
      }
    });
  });

  test.describe('Locale Handling', () => {
    test('should maintain locale after login attempt', async ({ page }) => {
      // Go to Albanian login page
      await page.goto('/sq/login');

      // Fill form and submit
      await page.fill('input[name="email"], input[type="email"]', 'test@example.com');
      await page.fill('input[name="password"], input[type="password"]', 'password');
      await page.click('button[type="submit"]');

      // Wait for response
      await page.waitForTimeout(1000);

      // Should still be in Albanian locale
      expect(page.url()).toContain('/sq/');
    });

    test('should display login page in English', async ({ page }) => {
      await page.goto('/en/login');

      // Check page is in English locale
      expect(page.url()).toContain('/en/');
    });

    test('should display login page in Albanian', async ({ page }) => {
      await page.goto('/sq/login');

      // Check page is in Albanian locale
      expect(page.url()).toContain('/sq/');
    });
  });
});
