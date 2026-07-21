import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

// Legacy inventory marker retained while the contract proves dormant routing.
test.describe('@legacy Claim routing (member → staff queue)', () => {
  test('prepared facts never enter the staff claims queue', async ({
    authenticatedPage: memberPage,
    staffPage,
  }, testInfo) => {
    const draftText = `Dormant routing ${Date.now()}`;
    await gotoApp(memberPage, routes.memberNewClaim(testInfo), testInfo, {
      marker: 'new-claim-page-ready',
    });
    const cookieConsent = memberPage.getByTestId('cookie-consent-accept').first();
    if (await cookieConsent.isVisible()) await cookieConsent.click();
    const intake = memberPage.locator('[data-testid="claim-draft-intake"]:visible').first();
    const panel = intake.getByTestId('claim-draft-main-panel');

    await intake.getByTestId('claim-draft-category-property').click();
    await intake.getByTestId('claim-draft-category-continue').click();
    await panel.locator('select').nth(0).selectOption('water_damage');
    await panel.locator('input[type="date"]').fill('2026-07-20');
    await panel.locator('input[type="text"]').fill('Dormant Routing Operator');
    await panel.locator('select').nth(1).selectOption('repair');
    await panel.locator('textarea').fill(draftText);
    await panel.locator('button').last().click();

    await expect(intake.getByTestId('claim-draft-submit-disabled')).toBeDisabled();
    await expect(memberPage.getByTestId('claim-created-success')).toHaveCount(0);
    await gotoApp(staffPage, routes.staffClaims(testInfo), testInfo, {
      marker: 'staff-page-ready',
    });
    await expect(staffPage.getByText(draftText, { exact: true })).toHaveCount(0);
  });
});
