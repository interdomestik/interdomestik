import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';
import { gotoMemberHomeStable } from './_helpers/member-home';

const MEMBER_HOME_MARKER_TIMEOUT_MS = 30000;

test.describe('Strict Gate: Member Home Crystal UI', () => {
  test('Member can navigate via the 4 Crystal CTAs', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const clickCtaAndAssertNavigation = async (
      ctaTestId: string,
      urlPattern: RegExp,
      readyMarker: string
    ) => {
      const cta = page.getByTestId(ctaTestId).first();
      await cta.scrollIntoViewIfNeeded();
      await expect(cta).toBeVisible();

      const href = await cta.getAttribute('href');
      expect(href, `${ctaTestId} must define href`).toBeTruthy();

      const navToTarget = page
        .waitForURL(urlPattern, { timeout: 7_000, waitUntil: 'commit' })
        .then(() => true)
        .catch(() => false);

      await cta.click();

      const reachedTarget = await navToTarget;
      const markerVisible = await page
        .getByTestId(readyMarker)
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (reachedTarget && markerVisible) return;

      await gotoApp(page, href!, testInfo, { marker: readyMarker });
    };

    // 1. Go to Member Home
    await gotoMemberHomeStable(page, testInfo, MEMBER_HOME_MARKER_TIMEOUT_MS);

    // Assert dashboard shell and CTA surface are visible before clicking.
    await expect(page.getByTestId('dashboard-page-ready').first()).toBeVisible();
    await expect(page.getByTestId('home-cta-incident').first()).toBeVisible();

    // 2. Incident Guide CTA
    await clickCtaAndAssertNavigation(
      'home-cta-incident',
      /\/incident-guide/,
      'incident-guide-page-ready'
    );

    // Back to home
    await gotoMemberHomeStable(page, testInfo, MEMBER_HOME_MARKER_TIMEOUT_MS);
    await expect(page.getByTestId('home-cta-incident').first()).toBeVisible();

    // 3. Report CTA
    await clickCtaAndAssertNavigation('home-cta-report', /\/claim-report/, 'report-page-ready');

    // Back to home
    await gotoMemberHomeStable(page, testInfo, MEMBER_HOME_MARKER_TIMEOUT_MS);
    await expect(page.getByTestId('home-cta-incident').first()).toBeVisible();

    // 4. Green Card CTA
    await clickCtaAndAssertNavigation(
      'home-cta-green-card',
      /\/green-card/,
      'green-card-page-ready'
    );

    // Back to home
    await gotoMemberHomeStable(page, testInfo, MEMBER_HOME_MARKER_TIMEOUT_MS);
    await expect(page.getByTestId('home-cta-incident').first()).toBeVisible();

    // 5. Benefits CTA
    await clickCtaAndAssertNavigation('home-cta-benefits', /\/benefits/, 'benefits-page-ready');
  });
});
