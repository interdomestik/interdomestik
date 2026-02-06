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
      await Promise.all([page.waitForURL(urlPattern), cta.click({ force: true })]);
      await expect(page).toHaveURL(urlPattern);
      await expect(page.getByTestId(readyMarker)).toBeVisible();
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
