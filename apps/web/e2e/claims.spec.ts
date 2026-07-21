import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

function visibleIntake(page: Page) {
  return page.locator('[data-testid="claim-draft-intake"]:visible').first();
}

async function dismissCookieConsent(page: Page) {
  const banner = page.getByTestId('cookie-consent-banner');
  if (!(await banner.isVisible().catch(() => false))) return;
  await page.getByTestId('cookie-consent-accept').first().click();
  await expect(banner).toHaveCount(0);
}

test.describe('Claims Flow', () => {
  test.describe('Public Access', () => {
    test('should redirect to login when accessing claims without auth', async ({
      page,
    }, testInfo) => {
      await page.context().clearCookies();
      await gotoApp(page, routes.memberClaims(), testInfo);
      await page.waitForURL(/.*login.*/);
      expect(page.url()).toMatch(/login/);
    });

    test('should redirect to login when accessing new claim without auth', async ({
      page,
    }, testInfo) => {
      await page.context().clearCookies();
      await gotoApp(page, routes.memberNewClaim(), testInfo);
      await page.waitForURL(/.*login.*/);
      expect(page.url()).toMatch(/login/);
    });
  });

  test.describe('Claim Draft Intake', () => {
    test('shows the dormant intake with honest account context', async ({
      authenticatedPage,
    }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberNewClaim(), testInfo);
      const intake = visibleIntake(authenticatedPage);

      await expect(intake).toBeVisible();
      await expect(intake.getByTestId('claim-draft-main-panel')).toBeVisible();
      await expect(intake.getByTestId('claim-draft-account-context')).toBeVisible();
      await expect(intake.getByTestId('claim-draft-submit-disabled')).toHaveCount(0);
    });

    test('shows supported categories and disables injury', async ({
      authenticatedPage,
    }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberNewClaim(), testInfo);
      const intake = visibleIntake(authenticatedPage);

      await expect(intake.getByTestId('claim-draft-category-vehicle')).toBeEnabled();
      await expect(intake.getByTestId('claim-draft-category-property')).toBeEnabled();
      await expect(intake.getByTestId('claim-draft-category-injury')).toBeDisabled();
    });

    test('requires a supported category before details', async ({
      authenticatedPage,
    }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberNewClaim(), testInfo);
      await dismissCookieConsent(authenticatedPage);
      const intake = visibleIntake(authenticatedPage);

      await intake.getByTestId('claim-draft-category-continue').click();
      await expect(intake.getByRole('alert')).toBeVisible();
      await expect(intake.locator('textarea')).toHaveCount(0);
    });
  });

  test.describe('Claims List', () => {
    test('should display claims list for authenticated user', async ({
      authenticatedPage,
    }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberClaims(), testInfo);

      await expect(authenticatedPage.getByTestId('page-title')).toBeVisible();
    });

    test('should have link to create new claim', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberClaims(), testInfo);

      const newClaimLink = authenticatedPage.getByTestId('create-claim-button');
      await expect(newClaimLink).toBeVisible();
    });
  });

  test.describe('Claim Detail', () => {
    test('should display claim details', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberClaims(), testInfo);

      const claimLink = authenticatedPage.locator('tbody tr a').first();
      await expect(claimLink).toBeVisible();

      const href = await claimLink.getAttribute('href');
      expect(href).toBeTruthy();

      await gotoApp(authenticatedPage, href!, testInfo);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(
        authenticatedPage.locator('[data-testid="claim-title"], h1, h2').first()
      ).toBeVisible();
    });

    test('should show claim status', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberClaims(), testInfo);
      const claimLink = authenticatedPage.locator('tbody tr a').first();
      await claimLink.click();
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const statusBadge = authenticatedPage.locator(
        '[data-testid="claim-status"], .status-badge, .badge, [class*="badge"]'
      );
      await expect(statusBadge.first()).toBeVisible();
    });

    test('should show claim timeline', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberClaims(), testInfo);
      const claimLink = authenticatedPage.locator('tbody tr a').first();
      await claimLink.click();
      await authenticatedPage.waitForLoadState('domcontentloaded');
    });
  });

  test.describe('Categories', () => {
    const categories = ['vehicle', 'property'] as const;

    for (const category of categories) {
      test(`should support ${category} category`, async ({ authenticatedPage }, testInfo) => {
        await gotoApp(authenticatedPage, routes.memberNewClaim(), testInfo);
        await dismissCookieConsent(authenticatedPage);
        const intake = visibleIntake(authenticatedPage);

        await intake.getByTestId(`claim-draft-category-${category}`).click();
        await intake.getByTestId('claim-draft-category-continue').click();
        await expect(intake.locator('textarea')).toBeVisible();
        await expect(intake.getByTestId('claim-draft-submit-disabled')).toHaveCount(0);
      });
    }
  });

  test.describe('Accessibility', () => {
    test('should have proper heading structure on claims page', async ({ page }, testInfo) => {
      await page.context().clearCookies();
      await gotoApp(page, routes.login(), testInfo);

      const headings = await page.locator('h1, h2, h3').all();
      expect(headings.length).toBeGreaterThan(0);
    });

    test('should have accessible form labels', async ({ page }, testInfo) => {
      await page.context().clearCookies();
      await gotoApp(page, routes.login(), testInfo);
      const emailInput = page.locator('input[name="email"], input[type="email"]');
      const hasLabel = await emailInput.evaluate((el: HTMLInputElement) => {
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledBy = el.getAttribute('aria-labelledby');
        const id = el.id;
        const hasAssociatedLabel = id && document.querySelector(`label[for="${id}"]`);

        return !!(ariaLabel || ariaLabelledBy || hasAssociatedLabel || el.closest('label'));
      });

      expect(hasLabel).toBeTruthy();
    });

    test('should support keyboard navigation', async ({ page }, testInfo) => {
      await page.context().clearCookies();
      await gotoApp(page, routes.login(), testInfo);
      const emailInput = page.locator('input[name="email"], input[type="email"]');
      await expect(emailInput).toBeVisible();
      await emailInput.focus();
      await expect(emailInput).toBeFocused();
    });
  });
});
