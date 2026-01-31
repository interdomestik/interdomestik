import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Strict Gate: Member Home Crystal UI', () => {
  test('Member can navigate via the 4 Crystal CTAs', async ({
    authenticatedPage: page,
  }, testInfo) => {
    // 1. Go to Member Home
    await gotoApp(page, routes.member(test.info()), testInfo, { marker: 'dashboard-heading' });

    // Assert we are on the dashboard
    await expect(page.getByTestId('dashboard-heading')).toBeVisible();

    // 2. Incident Guide CTA
    const ctaIncident = page.getByTestId('home-cta-incident');
    await expect(ctaIncident).toBeVisible();
    await ctaIncident.click();
    await expect(page).toHaveURL(/\/incident-guide/);
    await expect(page.getByTestId('incident-guide-page-ready')).toBeVisible();

    // Back to home
    await gotoApp(page, routes.member(test.info()), testInfo, { marker: 'dashboard-heading' });
    await expect(page.getByTestId('dashboard-heading')).toBeVisible();

    // 3. Report CTA
    const ctaReport = page.getByTestId('home-cta-report');
    await expect(ctaReport).toBeVisible();
    await ctaReport.click();
    await expect(page).toHaveURL(/\/report/);
    await expect(page.getByTestId('report-page-ready')).toBeVisible();

    // Back to home
    await gotoApp(page, routes.member(test.info()), testInfo, { marker: 'dashboard-heading' });
    await expect(page.getByTestId('dashboard-heading')).toBeVisible();

    // 4. Green Card CTA
    const ctaGreen = page.getByTestId('home-cta-green-card');
    await expect(ctaGreen).toBeVisible();
    await ctaGreen.click();
    await expect(page).toHaveURL(/\/green-card/);
    await expect(page.getByTestId('green-card-page-ready')).toBeVisible();

    // Back to home
    await gotoApp(page, routes.member(test.info()), testInfo, { marker: 'dashboard-heading' });
    await expect(page.getByTestId('dashboard-heading')).toBeVisible();

    // 5. Benefits CTA
    const ctaBenefits = page.getByTestId('home-cta-benefits');
    await expect(ctaBenefits).toBeVisible();
    await ctaBenefits.click();
    await expect(page).toHaveURL(/\/benefits/);
    await expect(page.getByTestId('benefits-page-ready')).toBeVisible();
  });
});
