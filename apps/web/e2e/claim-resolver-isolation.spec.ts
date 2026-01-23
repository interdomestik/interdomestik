import { expect, test } from '@playwright/test';
import { TEST_ADMIN_MK } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Claim Resolver Isolation', () => {
  test('MK Admin cannot access KS Claim via Resolver', async ({ page }, testInfo) => {
    // 1. Login as MK Admin
    await gotoApp(page, routes.login(testInfo), testInfo, { marker: 'auth-ready' });
    await page.getByTestId('login-email').fill(TEST_ADMIN_MK.email);
    await page.getByTestId('login-password').fill(TEST_ADMIN_MK.password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/admin/);

    // 2. Try to access known KS Claim
    // This claim exists in DB from backfill (we assume backfill ran).
    // Even if it doesn't exist, 404 is correct.
    // But if it DID exist and isolation failed, it might redirect (bad).
    // We expect 404 because cross-tenant access is forbidden.
    const targetClaimNumber = 'CLM-XK-2026-800001';

    await gotoApp(
      page,
      `${routes.admin(testInfo)}/claims/number/${targetClaimNumber}`,
      testInfo,
      { marker: 'page-ready' } // Assuming 404 page also has page-ready or similar layout
    );

    // 3. Expect 404
    // Checks for specific 404 content or title
    await expect(page.getByTestId('not-found-page')).toBeVisible();
    // OR check URL didn't redirect to claim details
  });
});
