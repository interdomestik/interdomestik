import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Staff Claims Queue MVP', () => {
  test('seeded staff sees actionable queue and can open a claim', async ({
    staffPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.staffClaims(testInfo), testInfo, {
      marker: 'staff-page-ready',
    });

    await expect(page.getByTestId('staff-claims-queue')).toBeVisible();
    await expect(page.getByTestId('staff-claims-row').first()).toBeVisible();
    await expect(page.getByTestId('staff-claims-view').first()).toHaveText('Open');

    await page.getByTestId('staff-claims-view').first().click();
    await expect(page).toHaveURL(/\/staff\/claims\/[^/]+$/);
    await expect(page.getByTestId('staff-claim-detail-ready')).toBeVisible();
  });
});
