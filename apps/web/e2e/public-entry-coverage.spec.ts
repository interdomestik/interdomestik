import { E2E_USERS } from '@interdomestik/database';

import { getTenantFromTestInfo } from './fixtures/auth.project';
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

function localizedPath(testInfo: Parameters<typeof routes.getLocale>[0], pathname: string) {
  return `/${routes.getLocale(testInfo)}${pathname}`;
}

test.describe('Post-E2 Public Entry Coverage', () => {
  test('covers the business membership entry page and server-side validation path', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      await gotoApp(page, localizedPath(testInfo, '/business-membership'), testInfo, {
        marker: 'business-membership-page-ready',
      });

      await expect(page.getByTestId('business-lead-form')).toBeVisible();
      await page.locator('[data-testid="business-lead-form"] button[type="submit"]').click();

      await expect(page.locator('#business-lead-firstName-error')).toBeVisible();
      await expect(page.locator('#business-lead-companyName-error')).toBeVisible();
      await expect(page.locator('#business-lead-email-error')).toBeVisible();
      await expect(page.locator('#business-lead-teamSize-error')).toBeVisible();
    });
  });

  test('covers the forgot-password browser flow from login through success state', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      const tenant = getTenantFromTestInfo(testInfo);
      const resetEmail = tenant === 'mk' ? E2E_USERS.MK_MEMBER.email : E2E_USERS.KS_MEMBER.email;

      await gotoApp(page, routes.login(testInfo), testInfo);

      await page.locator('a[href*="forgot-password"]').click();
      await page.waitForURL(/\/forgot-password$/);

      await page.locator('input[name="email"], input[type="email"]').fill(resetEmail);
      await page.locator('button[type="submit"]').click();

      await expect(page.getByText('Check your email')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Return to login' })).toBeVisible();
    });
  });

  test('covers the reset-password browser flow when a token is present', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      await gotoApp(
        page,
        {
          pathname: localizedPath(testInfo, '/reset-password'),
          search: '?token=test-token',
        },
        testInfo
      );

      await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible();
      await page.locator('input[name="password"]').fill('password-one');
      await page.locator('input[name="confirmPassword"]').fill('password-two');
      await page.locator('button[type="submit"]').click();

      await expect(page.getByText('Passwords do not match')).toBeVisible();
    });
  });
});
