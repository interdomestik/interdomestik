import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

const goldenId = (...parts: Array<string | number>) => `golden_${parts.join('_').toLowerCase()}`;

test.describe('Staff Claims Readonly', () => {
  test('staff can view claims and cannot access other-tenant claim', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginAs('staff');

    await gotoApp(page, routes.staff(testInfo), testInfo, {
      marker: 'staff-dashboard-ready',
    });

    await gotoApp(page, routes.staffClaims(testInfo), testInfo, {
      marker: 'staff-page-ready',
    });

    await page.getByTestId('staff-claims-view').first().click();

    await expect(page.getByTestId('staff-claim-detail-ready')).toBeVisible();
    await expect(page.getByTestId('staff-claim-detail-member')).toBeVisible();
    await expect(page.getByTestId('staff-claim-detail-agent')).toBeVisible();

    await expect(page.getByRole('button', { name: /assign|update|save|change/i })).toHaveCount(0);

    const otherTenantClaimId = goldenId('mk_track_claim_001');
    await gotoApp(page, routes.staffClaimDetail(otherTenantClaimId, testInfo), testInfo, {
      marker: 'not-found-page',
    });
    await expect(page.getByTestId('not-found-page')).toBeVisible();
  });
});
