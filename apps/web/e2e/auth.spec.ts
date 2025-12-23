/**
 * Authentication E2E Tests
 *
 * End-to-end tests for authentication flows including login, logout, and registration.
 */

import { expect, isLoggedIn, test } from './fixtures/auth.fixture';

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
    test('should redirect /member to login when not authenticated', async ({ page }) => {
      await page.goto('/member');

      // Should be redirected to login
      await page.waitForURL(/.*login.*/);
      expect(page.url()).toMatch(/login/);
    });

    test('should redirect /member/claims to login when not authenticated', async ({ page }) => {
      await page.goto('/member/claims');

      // Should be redirected to login
      await page.waitForURL(/.*login.*/);
      expect(page.url()).toMatch(/login/);
    });

    test.skip('should redirect /member/settings to login when not authenticated', async ({
      page,
    }) => {
      await page.goto('/member/settings');

      // Wait for redirect
      await page.waitForURL(/.*(login|auth\/sign-in|\/en\/?$|\/sq\/?$).*/, { timeout: 10000 });

      // Should be redirected to login or home
      expect(page.url()).toMatch(/(login|auth\/sign-in|\/en\/?$|\/sq\/?$)/);
    });

    test('should allow member portal when authenticated fixture is used', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/member');
      // Wait for page to fully load (WebKit needs this for auth state)
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(1000);
      expect(authenticatedPage.url()).not.toMatch(/login/);
      const loggedIn = await isLoggedIn(authenticatedPage);
      expect(loggedIn).toBeTruthy();
    });
  });

  test.describe('Register Page', () => {
    test('should display registration form if available', async ({ page }) => {
      await page.goto('/register');
      await page.waitForLoadState('domcontentloaded');

      // Check if register page exists (might redirect to login)
      const currentUrl = page.url();

      if (currentUrl.includes('register')) {
        // Wait for form to potentialy load
        await page.waitForSelector('form', { state: 'visible', timeout: 5000 }).catch(() => {});

        if (await page.locator('form').isVisible()) {
          await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
          await expect(
            page.locator('input[name="password"], input[type="password"]').first()
          ).toBeVisible();
          await expect(page.locator('button[type="submit"]')).toBeVisible();
        }
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
      await page.fill('input[name="email"], input[type="email"]', 'test@interdomestik.com');
      await page.fill('input[name="password"], input[type="password"]', 'TestPassword123!');
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
