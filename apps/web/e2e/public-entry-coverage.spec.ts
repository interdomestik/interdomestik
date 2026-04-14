import { E2E_USERS } from '@interdomestik/database';

import { getTenantFromTestInfo } from './fixtures/auth.project';
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

test.describe('Post-E2 Public Entry Coverage', () => {
  test('covers the business membership entry page and server-side validation path', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      await gotoApp(page, routes.businessMembership(testInfo), testInfo, {
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
      await page.waitForURL(new RegExp(`${routes.forgotPassword(testInfo)}$`));

      await page.locator('input[name="email"], input[type="email"]').fill(resetEmail);
      await page.locator('button[type="submit"]').click();

      await expect(page.getByTestId('forgot-password-success')).toBeVisible();
      await expect(page.getByTestId('forgot-password-success-title')).toBeVisible();
      await expect(page.getByTestId('forgot-password-success-body')).toBeVisible();
      await expect(page.getByTestId('forgot-password-return-to-login')).toHaveAttribute(
        'href',
        routes.login(testInfo)
      );
    });
  });

  test('covers the reset-password browser flow when a token is present', async ({
    browser,
  }, testInfo) => {
    await withAnonymousPage(browser, testInfo, async page => {
      await gotoApp(
        page,
        {
          pathname: routes.resetPassword(testInfo),
          search: '?token=test-token',
        },
        testInfo
      );

      await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible();
      await expect(page.getByRole('form', { name: 'Reset password form' })).toHaveAttribute(
        'data-hydrated',
        'true'
      );
      await page.locator('input[name="password"]').fill('password-one');
      await page.locator('input[name="confirmPassword"]').fill('password-two');
      await page.locator('button[type="submit"]').click();

      await expect(
        page
          .getByRole('form', { name: 'Reset password form' })
          .locator('#reset-password-form-error')
      ).toHaveText('Passwords do not match');
    });
  });
});
