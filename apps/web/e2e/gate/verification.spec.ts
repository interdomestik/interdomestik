import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Admin Verification Queue (Cash)', () => {
  test('Tenant Admin sees an open cash request with its decision actions', async ({
    page,
    loginAs,
  }, testInfo) => {
    // 1. Login as Tenant Admin
    await loginAs('admin');

    // 2. Navigate to Leads / Verification
    await gotoApp(page, routes.adminLeads(testInfo), testInfo, { marker: 'verification-ops-page' });

    // 3. Verify Page Title
    await expect(
      page.getByRole('heading', {
        name: /Verifikimi|Payment Verification|Lead Payment|Верификација/i,
      })
    ).toBeVisible();

    // 4. The golden seed gives every tenant open cash requests, so a queue row is required: an
    // empty queue fails here instead of passing as an accepted state.
    const row = page.getByTestId('cash-verification-row').filter({ visible: true }).first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId('cash-approve')).toBeVisible();
    await expect(row.getByTestId('cash-needs-info')).toBeVisible();
    await expect(row.getByTestId('cash-reject')).toBeVisible();
  });
});
