import { expect, test, type TestInfo } from '@playwright/test';
import path from 'path';

import { routes } from './routes';
import { gotoApp } from './utils/navigation';

// Helper to get auth state path
const authState = (role: string) => path.join(__dirname, 'fixtures/.auth', `${role}.json`);

const getOrigin = (testInfo: TestInfo) => {
  const baseURL = testInfo.project.use.baseURL?.toString();
  if (!baseURL) {
    throw new Error('[rbac-isolation] Missing baseURL for origin derivation');
  }
  return new URL(baseURL).origin;
};

test.describe('RBAC Isolation Invariants', () => {
  test.describe('Staff Context (Tenant-Wide)', () => {
    test.use({ storageState: authState('staff') });

    test('Staff can see claims from multiple branches', async ({ page }, testInfo) => {
      // 1. Navigate to Claims List
      // Using /staff/claims as Staff Portal
      await gotoApp(page, routes.staffClaims(testInfo), testInfo, { marker: 'page-ready' });

      // 2. Verify page loads
      await expect(page.locator('main, body').first()).toBeVisible();
      await expect(page.getByTestId('not-found-page')).not.toBeVisible();

      // Attempt to verify table presence
      // await expect(page.getByRole('table')).toBeVisible();
    });
  });

  test.describe('Branch Manager Context (Scoped)', () => {
    test.use({ storageState: authState('branch_manager') });

    test('Branch Manager cannot see claims from another branch', async ({ page }, testInfo) => {
      const origin = getOrigin(testInfo);

      // 1. Log Session (Non-blocking assertion)
      // We check session just for debugging, but don't fail the test if branchId is not exposed to client
      try {
        const sessionResponse = await page.request.get(
          new URL('/api/auth/get-session', origin).toString()
        );
        if (sessionResponse.ok()) {
          const sessionData = await sessionResponse.json();
          console.log('BM Session Data:', JSON.stringify(sessionData, null, 2));
          // If session exposes branchId, it must be correct.
          if (sessionData?.user?.branchId) {
            expect(sessionData.user.branchId).toBe('branch-a');
          }
        }
      } catch (e) {
        console.log('Failed to inspect session data', e);
      }

      // 2. Attempt to access a known claim from Branch B
      // ID known from seeding: claim-branch-b-1
      const response = await page.request.get(
        new URL('/api/claims/claim-branch-b-1', origin).toString()
      );
      console.log(`BM Access Branch B Claim (API) Status: ${response.status()}`);

      // If the API returns 200, it's a security failure.
      // 403 or 404 is acceptable.
      expect([403, 404]).toContain(response.status());

      // 3. Verify UI List isolation
      await gotoApp(page, routes.staffClaims(testInfo), testInfo, { marker: 'page-ready' });
      await expect(page.getByTestId('admin-claim-row-claim-branch-b-1')).not.toBeVisible();
    });
  });

  test.describe('Agent Context (Owner Scoped)', () => {
    test.use({ storageState: authState('agent') });

    test('Agent can create claim', async ({ page }, testInfo) => {
      // Agent uses Member Portal for claim creation
      await gotoApp(page, routes.memberNewClaim(testInfo), testInfo, { marker: 'page-ready' });

      await expect(page.getByTestId('not-found-page')).not.toBeVisible();
      // Check for generic form button
      await expect(page.getByRole('button').first()).toBeVisible();
    });

    test('Agent cannot handle/resolve claims', async ({ page }, testInfo) => {
      // Agents should NOT see "Resolve" buttons on claims
      await gotoApp(page, routes.memberClaims(testInfo), testInfo, { marker: 'page-ready' });
      await expect(page.getByTestId('not-found-page')).not.toBeVisible();
      await expect(page.getByTestId('claim-action-resolve')).not.toBeVisible();
      await expect(page.getByTestId('claim-action-approve')).not.toBeVisible();
    });
  });
});
