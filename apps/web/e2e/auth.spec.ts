/**
 * Authentication E2E Tests (STRICT)
 */

import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { expect, isLoggedIn, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should display login form', async ({ page }, testInfo) => {
      await gotoApp(page, routes.login(testInfo), testInfo, { marker: 'auth-ready' });

      await expect(page.getByTestId('login-form')).toBeVisible();
      await expect(page.getByTestId('login-email')).toBeVisible();
      await expect(page.getByTestId('login-password')).toBeVisible();
      await expect(page.getByTestId('login-submit')).toBeVisible();
    });

    test('should show validation error for empty email', async ({ page }, testInfo) => {
      await gotoApp(page, routes.login(testInfo), testInfo, { marker: 'auth-ready' });
      await page.getByTestId('login-submit').click();

      const emailInput = page.getByTestId('login-email');
      const hasError = await emailInput.evaluate((el: HTMLInputElement) => {
        return (el.validity && !el.validity.valid) || el.getAttribute('aria-invalid') === 'true';
      });
      expect(hasError).toBeTruthy();
    });

    test('should show error for invalid credentials', async ({ page }, testInfo) => {
      await gotoApp(page, routes.login(testInfo), testInfo, { marker: 'auth-ready' });

      await page.getByTestId('login-email').fill('wrong@example.com');
      await page.getByTestId('login-password').fill('wrongpassword');
      await page.getByTestId('login-submit').click();

      await expect(page.getByTestId('login-error')).toBeVisible();
    });

    test('should have link to registration', async ({ page }, testInfo) => {
      await gotoApp(page, routes.login(testInfo), testInfo, { marker: 'auth-ready' });
      await expect(page.getByTestId('register-link')).toBeVisible();
    });

    test('should have forgot password link', async ({ page }, testInfo) => {
      await gotoApp(page, routes.login(testInfo), testInfo, { marker: 'auth-ready' });
      await expect(page.getByTestId('forgot-password-link')).toBeVisible();
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect /member to login when not authenticated', async ({
      browser,
    }, testInfo) => {
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
        baseURL: testInfo.project.use.baseURL?.toString(),
      });
      const page = await context.newPage();

      await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'auth-ready' });
      const loginPath = routes.login(testInfo);
      // Escape the path for regex use if it contains special chars (usually it doesn't)
      await expect(page).toHaveURL(new RegExp(`${loginPath.replace(/\//g, '\\/')}(\\?|$)`));

      await context.close();
    });

    test('should allow member portal when authenticated fixture is used', async ({
      authenticatedPage,
    }, testInfo) => {
      await gotoApp(authenticatedPage, routes.member(testInfo), testInfo, {
        marker: 'member-dashboard-ready',
      });
      await expect(authenticatedPage).toHaveURL(new RegExp(routes.member(testInfo)));
      const loggedIn = await isLoggedIn(authenticatedPage);
      expect(loggedIn).toBeTruthy();
    });
  });

  test.describe('Register Page', () => {
    test('should display registration form', async ({ page }, testInfo) => {
      // Use tenantId to skip tenant selector and go straight to form
      await gotoApp(page, `${routes.register(testInfo)}?tenantId=tenant_ks`, testInfo, {
        marker: 'registration-page-ready',
      });

      await expect(page.getByTestId('registration-email')).toBeVisible();
      await expect(page.getByTestId('registration-password')).toBeVisible();
      await expect(page.getByTestId('registration-submit')).toBeVisible();
    });
  });

  test.describe('Locale Handling', () => {
    test('should maintain locale after login attempt', async ({ page }, testInfo) => {
      await gotoApp(page, routes.login('sq'), testInfo, { marker: 'auth-ready' });

      await page.getByTestId('login-email').fill(E2E_USERS.KS_MEMBER.email);
      await page.getByTestId('login-password').fill(E2E_PASSWORD);
      await page.getByTestId('login-submit').click();

      // Successful login should redirect to dashboard in Albanian
      await expect(page).toHaveURL(/.*\/sq\/member/, { timeout: 15000 });
      await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
    });

    test('should display login page in English', async ({ page }, testInfo) => {
      await gotoApp(page, routes.login('en'), testInfo, { marker: 'auth-ready' });
      expect(page.url()).toContain('/en/');
    });

    test('should display login page in Albanian', async ({ page }, testInfo) => {
      await gotoApp(page, routes.login('sq'), testInfo, { marker: 'auth-ready' });
      expect(page.url()).toContain('/sq/');
    });
  });
});
