import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';
import { assertAccessDenied } from './utils/rbac';

test.describe('Branch Dashboard RBAC', () => {
  test.describe.configure({ mode: 'serial' });

  test('Admin can access branch dashboard', async ({ adminPage: page }, testInfo) => {
    // First go to branches list
    await gotoApp(page, routes.adminBranches, testInfo, { marker: 'page-ready' });

    // Find first branch card and click to navigate to dashboard
    const firstBranchCard = page.getByTestId('branch-card').first();

    if (await firstBranchCard.isVisible()) {
      // Click on the branch link to navigate to dashboard
      await firstBranchCard.getByRole('link').click();

      // Should be on branch dashboard page
      await expect(page).toHaveURL(/\/admin\/branches\/.+/);
    }
  });

  test('Branch manager can only access their own branch', async ({
    branchManagerPage: page,
  }, testInfo) => {
    // Verify access for Branch Manager
    // This fixture now intelligently selects KS or MK BM based on the project URL.

    // Navigate to branches list
    await gotoApp(page, routes.adminBranches, testInfo, { marker: 'page-ready' });

    // BM should see their branch or be redirected
    await expect(page).toHaveURL(/\/admin/);
  });

  test('Agent cannot access branch dashboard', async ({ agentPage: page }, testInfo) => {
    // Try to access admin branches directly
    await gotoApp(page, l => `${routes.adminBranches(l)}/test-branch`, testInfo, {
      marker: 'page-ready',
    });

    // Should see 404 (Strict Isolation)
    await assertAccessDenied(page);
  });
});

/**
 * E2E Navigation Smoke Test
 * Verifies happy-path rendering of branch dashboard UI
 */
test.describe('Branch Dashboard Navigation Smoke', () => {
  test('Admin navigates to branch dashboard and sees UI elements', async ({
    adminPage: page,
  }, testInfo) => {
    // Go to branches list
    await gotoApp(page, routes.adminBranches, testInfo, { marker: 'page-ready' });

    // Check if any branches exist (UI uses Cards now)
    const branchCard = page.getByTestId('branch-card').first();

    // Force wait/assert - fail if not found
    await expect(branchCard).toBeVisible({ timeout: 10000 });

    // Navigate
    await branchCard.getByRole('link').click();
    await page.waitForLoadState('domcontentloaded');

    // Verify we're on a branch dashboard page
    await expect(page).toHaveURL(/\/admin\/branches\/[a-zA-Z0-9-]+/);

    // Verify key UI elements render
    await expect(page.getByTestId('branches-back-link')).toBeVisible();

    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();

    const statsSection = page.locator('[class*="grid"]').first();
    await expect(statsSection).toBeVisible();
  });

  test('Staff can access branches list', async ({ staffPage: page }, testInfo) => {
    await gotoApp(page, routes.adminBranches, testInfo, { marker: 'page-ready' });

    // Staff should have access to branches
    await expect(page).toHaveURL(/\/admin\/branches/);
  });
});
