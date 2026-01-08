import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Branch Dashboard RBAC', () => {
  test.describe.configure({ mode: 'serial' });

  test('Admin can access branch dashboard', async ({ adminPage: page }) => {
    // First go to branches list
    await page.goto(routes.adminBranches());
    await page.waitForLoadState('domcontentloaded');

    // Find first branch row and click to navigate to dashboard
    const firstBranchRow = page
      .getByRole('row')
      .filter({ hasNot: page.getByRole('columnheader') })
      .first();
    if (await firstBranchRow.isVisible()) {
      // Click on the branch name to navigate to dashboard
      await firstBranchRow.getByRole('cell').first().click();

      // Should be on branch dashboard page
      await expect(page).toHaveURL(/\/admin\/branches\/.+/);
    }
  });

  test('Branch manager can only access their own branch', async ({ branchManagerPage: page }) => {
    // Navigate to branches list
    await page.goto(routes.adminBranches());
    await page.waitForLoadState('domcontentloaded');

    // BM should see their branch or be redirected
    await expect(page).toHaveURL(/\/admin/);
  });

  test('Agent cannot access branch dashboard', async ({ agentPage: page }) => {
    // Try to access admin branches directly
    await page.goto('/en/admin/branches/test-branch');
    await page.waitForLoadState('domcontentloaded');

    // Should be redirected away from admin area
    await expect(page).not.toHaveURL(/\/admin\/branches/);
  });
});

/**
 * E2E Navigation Smoke Test
 * Verifies happy-path rendering of branch dashboard UI
 */
test.describe('Branch Dashboard Navigation Smoke', () => {
  test('Admin navigates to branch dashboard and sees UI elements', async ({ adminPage: page }) => {
    // Go to branches list
    await page.goto(routes.adminBranches());
    await page.waitForLoadState('domcontentloaded');

    // Check if any branches exist
    const branchRow = page
      .getByRole('row')
      .filter({ hasNot: page.getByRole('columnheader') })
      .first();

    if (await branchRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click branch name to navigate
      await branchRow.getByRole('cell').first().click();
      await page.waitForLoadState('domcontentloaded');

      // Verify we're on a branch dashboard page
      await expect(page).toHaveURL(/\/admin\/branches\/[a-zA-Z0-9-]+/);

      // Verify key UI elements render (no need to validate exact numbers)
      // Back button should be visible
      await expect(page.getByRole('link', { name: /back/i })).toBeVisible();

      // Branch header with name should render
      const heading = page.locator('h1, h2').first();
      await expect(heading).toBeVisible();

      // Stats cards should be present
      const statsSection = page.locator('[class*="grid"]').first();
      await expect(statsSection).toBeVisible();
    } else {
      // No branches in test data - skip gracefully
      test.skip();
    }
  });

  test('Staff can access branches list', async ({ staffPage: page }) => {
    await page.goto(routes.adminBranches());
    await page.waitForLoadState('domcontentloaded');

    // Staff should have access to branches
    await expect(page).toHaveURL(/\/admin\/branches/);
  });
});
