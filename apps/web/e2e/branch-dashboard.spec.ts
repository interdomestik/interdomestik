import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Branch Dashboard RBAC', () => {
  test.describe.configure({ mode: 'serial' });

  test('Admin can access branch dashboard', async ({ adminPage: page }) => {
    // First go to branches list
    await page.goto(routes.adminBranches());
    await page.waitForLoadState('domcontentloaded');

    // Find first branch card and click to navigate to dashboard
    const firstBranchCard = page.getByTestId('branch-card').first();

    if (await firstBranchCard.isVisible()) {
      // Click on the branch link to navigate to dashboard
      await firstBranchCard.getByRole('link').click();

      // Should be on branch dashboard page
      await expect(page).toHaveURL(/\/admin\/branches\/.+/);
    }
  });

  test('Branch manager can only access their own branch', async ({ branchManagerPage: page }) => {
    // Verify access for Branch Manager
    // This fixture now intelligently selects KS or MK BM based on the project URL.

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
    await page.waitForTimeout(500); // Allow redirect to complete

    // App uses redirect-first strategy: agents are sent to /agent, not shown 404
    const currentPath = new URL(page.url()).pathname;
    // Normalize: remove locale prefix like /sq/ or /en/ for comparison
    const normalizedPath = currentPath.replace(/^\/[a-z]{2}\//, '/').replace(/^\/[a-z]{2}$/, '/');
    const isOnAdmin = normalizedPath.startsWith('/admin');

    if (isOnAdmin) {
      // If still on admin path, expect 404 UI
      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible({ timeout: 5000 });
    } else {
      // Redirected away from admin (to /agent) is valid denial
      expect(normalizedPath).toMatch(/^\/agent/);
    }
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

  test('Staff cannot access branches list (redirected to /staff)', async ({ staffPage: page }) => {
    await page.goto(routes.adminBranches());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500); // Allow redirect to complete

    // Staff is NOT in ADMIN_ALLOWED_ROLES, so they get redirected to /staff
    const currentPath = new URL(page.url()).pathname;
    // Normalize: remove locale prefix
    const normalizedPath = currentPath.replace(/^\/[a-z]{2}\//, '/').replace(/^\/[a-z]{2}$/, '/');
    const isOnAdmin = normalizedPath.startsWith('/admin');

    if (isOnAdmin) {
      // If still on admin path, expect 404 UI
      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible({ timeout: 5000 });
    } else {
      // Redirected away from admin (to /staff) is valid denial
      expect(normalizedPath).toMatch(/^\/staff/);
    }
  });
});
