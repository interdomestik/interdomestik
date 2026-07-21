import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('SQ dormant claim draft copy', () => {
  test('keeps the Albanian route and intake language aligned', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.memberNewClaim('sq'), testInfo, {
      marker: 'new-claim-page-ready',
    });
    const intake = page.locator('[data-testid="claim-draft-intake"]:visible').first();

    await expect(
      intake.getByRole('heading', { name: 'Përgatitni skicën e kërkesës suaj' })
    ).toBeVisible();
    await expect(intake).toContainText('Vetëm skicë');
    await expect(intake.getByRole('button', { name: 'Vazhdoni te hollësitë' })).toBeVisible();
    await expect(intake.getByTestId('claim-draft-category-injury')).toBeDisabled();
    await expect(page.getByText('Prepare your claim draft')).toHaveCount(0);
  });
});
