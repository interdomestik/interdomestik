import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Dormant claim draft evidence boundary', () => {
  test('does not expose upload or evidence submission controls', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.memberNewClaim(testInfo), testInfo, {
      marker: 'new-claim-page-ready',
    });
    const intake = page.locator('[data-testid="claim-draft-intake"]:visible').first();

    await expect(intake).toBeVisible();
    await expect(intake.locator('input[type="file"]')).toHaveCount(0);
    await expect(intake.getByTestId('wizard-submit')).toHaveCount(0);
    await expect(page.getByTestId('claim-created-success')).toHaveCount(0);
    await expect(intake.getByTestId('claim-draft-category-injury')).toBeDisabled();
  });
});
