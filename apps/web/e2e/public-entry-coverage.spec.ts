import { E2E_USERS } from '@interdomestik/database';
import type { TestInfo } from '@playwright/test';

import de from '../src/messages/de/auth.json';
import en from '../src/messages/en/auth.json';
import mk from '../src/messages/mk/auth.json';
import sq from '../src/messages/sq/auth.json';
import sr from '../src/messages/sr/auth.json';

import { getTenantFromTestInfo } from './fixtures/auth.project';
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

const AUTH_CATALOGS = { de, en, hr: sq, mk, sq, sr } as const;
const recoveryCopy = (testInfo: TestInfo) =>
  AUTH_CATALOGS[routes.getLocale(testInfo)].auth.passwordRecovery;

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
      await expect(page.locator('#business-lead-consent-error')).toBeVisible();
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

      const copy = recoveryCopy(testInfo);
      await expect(page.getByRole('heading', { name: copy.resetTitle })).toBeVisible();
      await expect(page.getByRole('form', { name: copy.formLabel })).toHaveAttribute(
        'data-hydrated',
        'true'
      );
      await page.locator('input[name="password"]').fill('password-one');
      await page.locator('input[name="confirmPassword"]').fill('password-two');
      await page.locator('button[type="submit"]').click();

      await expect(
        page.getByRole('form', { name: copy.formLabel }).locator('#reset-password-form-error')
      ).toHaveText(copy.mismatch);
    });
  });
});
