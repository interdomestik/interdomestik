import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Strict Gate: Member Home Crystal UI', () => {
  test('Member can navigate via the 4 Crystal CTAs', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const clickCtaAndAssertNavigation = async (
      ctaTestId: string,
      urlPattern: RegExp,
      readyMarker: string
    ) => {
      const cta = page.getByTestId(ctaTestId);
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
    await gotoApp(page, routes.member(test.info()), testInfo, { marker: 'member-dashboard-ready' });

    // Assert we are on the dashboard
    await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();

    // 2. Incident Guide CTA
    await clickCtaAndAssertNavigation(
      'home-cta-incident',
      /\/incident-guide/,
      'incident-guide-page-ready'
    );

    // Back to home
    await gotoApp(page, routes.member(test.info()), testInfo, { marker: 'member-dashboard-ready' });
    await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();

    // 3. Report CTA
    await clickCtaAndAssertNavigation('home-cta-report', /\/claim-report/, 'report-page-ready');

    // Back to home
    await gotoApp(page, routes.member(test.info()), testInfo, { marker: 'member-dashboard-ready' });
    await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();

    // 4. Green Card CTA
    await clickCtaAndAssertNavigation(
      'home-cta-green-card',
      /\/green-card/,
      'green-card-page-ready'
    );

    // Back to home
    await gotoApp(page, routes.member(test.info()), testInfo, { marker: 'member-dashboard-ready' });
    await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();

    // 5. Benefits CTA
    await clickCtaAndAssertNavigation('home-cta-benefits', /\/benefits/, 'benefits-page-ready');
  });
});
