import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Dormant claim draft intake', () => {
  test('prepares facts while claim submission stays unavailable', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.memberNewClaim(testInfo), testInfo, {
      marker: 'new-claim-page-ready',
    });
    const cookieConsent = page.getByTestId('cookie-consent-accept').first();
    if (await cookieConsent.isVisible()) await cookieConsent.click();
    const intake = page.locator('[data-testid="claim-draft-intake"]:visible').first();
    const panel = intake.getByTestId('claim-draft-main-panel');

    await expect(intake).toBeVisible();
    await intake.getByTestId('claim-draft-category-vehicle').click();
    await intake.getByTestId('claim-draft-category-continue').click();
    await panel.locator('select').nth(0).selectOption('collision');
    await panel.locator('input[type="date"]').fill('2026-07-20');
    await panel.locator('input[type="text"]').fill('Dormant Submission Operator');
    await panel.locator('select').nth(1).selectOption('repair');
    await panel.locator('textarea').fill('Dormant submission contract facts.');
    await panel.locator('button').last().click();

    await expect(intake.getByTestId('claim-draft-dormant-preview')).toBeVisible();
    await expect(intake.getByTestId('claim-draft-submit-disabled')).toBeDisabled();
    await expect(page.getByTestId('claim-created-success')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${routes.memberNewClaim(testInfo)}$`));
  });
});
