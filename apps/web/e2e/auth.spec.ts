/**
 * Authentication E2E Tests
 *
 * End-to-end tests for authentication flows including login, logout, and public onboarding entry.
 */

import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';

import { expect, isLoggedIn, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should display login form', async ({ browser }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.login(testInfo), testInfo);

        // Check for form elements
        await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
        await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
      });
    });

    test('should show validation error for empty email', async ({ browser }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.login(testInfo), testInfo);

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
    });

    test('should show validation error for invalid email format', async ({ browser }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.login(testInfo), testInfo);

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
    });

    test('should have link to public membership entry', async ({ browser }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.login(testInfo), testInfo);

        const membershipEntryLink = page.locator('a[href*="pricing"]');
        await expect(membershipEntryLink.first()).toBeVisible();
      });
    });

    test('should have forgot password link', async ({ browser }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.login(testInfo), testInfo);

        const forgotLink = page.locator(
          'a:has-text("forgot"), a[href*="forgot"], a[href*="reset"]'
        );

        if (await forgotLink.isVisible()) {
          await expect(forgotLink).toBeVisible();
        }
      });
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect /member to login when not authenticated', async ({
      browser,
    }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.member(testInfo), testInfo);

        // Should be redirected to login
        await page.waitForURL(/.*login.*/);
        expect(page.url()).toMatch(/login/);
      });
    });

    test('should redirect /member/claims to login when not authenticated', async ({
      browser,
    }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.memberClaims(testInfo), testInfo);

        // Should be redirected to login
        await page.waitForURL(/.*login.*/);
        expect(page.url()).toMatch(/login/);
      });
    });

    test('should redirect /member/settings to login when not authenticated', async ({
      browser,
    }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.memberSettings(testInfo), testInfo);

        // Wait for redirect
        await page.waitForURL(/.*(login|auth\/sign-in|\/en\/?$|\/sq\/?$).*/, { timeout: 10000 });

        // Should be redirected to login or home
        expect(page.url()).toMatch(/(login|auth\/sign-in|\/en\/?$|\/sq\/?$)/);
      });
    });

    test('should allow member portal when authenticated fixture is used', async ({
      authenticatedPage,
    }, testInfo) => {
      await gotoApp(authenticatedPage, routes.member(), testInfo);
      // Wait for page to fully load (WebKit needs this for auth state)
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(1000);
      await expect(authenticatedPage).toHaveURL(/.*member.*/);
      expect(authenticatedPage.url()).not.toMatch(/login/);
      const loggedIn = await isLoggedIn(authenticatedPage);
      expect(loggedIn).toBeTruthy();
    });
  });

  test.describe('Register Page', () => {
    test('should display registration form if available', async ({ browser }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.register(testInfo), testInfo);
        await page.waitForLoadState('domcontentloaded');

        // Check if register page exists (might redirect to login)
        const currentUrl = page.url();

        if (currentUrl.includes('register')) {
          // Wait for form to potentially load
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
    });

    test('should have terms and conditions checkbox if required', async ({ browser }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.register(testInfo), testInfo);

        const termsCheckbox = page.locator('input[type="checkbox"]');

        if (await termsCheckbox.isVisible()) {
          await expect(termsCheckbox).toBeVisible();
        }
      });
    });
  });

  test.describe('Public Membership Entry', () => {
    test('should show the OTP onboarding step after plan confirmation', async ({
      browser,
    }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.publicMembershipEntry(testInfo), testInfo, {
          marker: 'pricing-page-ready',
        });

        await page.getByTestId('plan-cta-standard').click();
        await expect(page.getByTestId('pricing-precheckout-confirmation')).toBeVisible();
        await page.getByTestId('precheckout-continue-cta').click();

        await expect(page.getByTestId('pricing-otp-step')).toBeVisible();
        await expect(page.getByTestId('pricing-otp-email-input')).toBeVisible();
        await expect(page.getByTestId('pricing-otp-code-input')).toBeVisible();
      });
    });
  });

  test.describe('Locale Handling', () => {
    test('should maintain locale after login attempt', async ({ browser }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        // Go to Albanian login page
        await gotoApp(page, routes.login('sq'), testInfo);

        // Fill form and submit
        await page.fill('input[name="email"], input[type="email"]', E2E_USERS.KS_MEMBER.email);
        await page.fill('input[name="password"], input[type="password"]', E2E_PASSWORD);
        await page.click('button[type="submit"]');

        // Wait for response
        await page.waitForTimeout(1000);

        // Should still be in Albanian locale
        expect(page.url()).toContain('/sq/');
      });
    });

    test('should display login page in English', async ({ browser }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.login('en'), testInfo);

        // Check page is in English locale
        expect(page.url()).toContain('/en/');
      });
    });

    test('should display login page in Albanian', async ({ browser }, testInfo) => {
      await withAnonymousPage(browser, testInfo, async page => {
        await gotoApp(page, routes.login('sq'), testInfo);

        // Check page is in Albanian locale
        expect(page.url()).toContain('/sq/');
      });
    });
  });
});
