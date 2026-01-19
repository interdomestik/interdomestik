import { expect, test } from '../fixtures/auth.fixture';

/**
 * Agent Pro Scaffold Test
 *
 * Tests the ability to switch between Lite and Pro agent workspaces.
 */
test.describe('Agent Pro Scaffold (Golden)', () => {
  test('Agent can navigate to Pro workspace', async ({ page, loginAs }) => {
    // 1. Login as Agent
    await loginAs('agent');
    await page.waitForLoadState('domcontentloaded');

    // 2. Verify we're on agent dashboard
    await expect(page).toHaveURL(/\/agent/);

    // 3. Navigate to Pro Workspace directly
    await page.goto('/en/agent/workspace');
    await page.waitForLoadState('domcontentloaded');

    // 4. Verify Pro Workspace loaded
    await expect(page).toHaveURL(/\/agent\/workspace/);

    // 5. Verify main content renders
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();

    // 6. Verify we can navigate to sub-pages
    // Try claims
    await page.goto('/en/agent/workspace/claims');
    await expect(page).toHaveURL(/\/agent\/workspace\/claims/);

    // Try leads
    await page.goto('/en/agent/workspace/leads');
    await expect(page).toHaveURL(/\/agent\/workspace\/leads/);

    // 7. Navigate back to lite dashboard
    await page.goto('/en/agent');
    await expect(page).toHaveURL(/\/agent$/);
  });
});
