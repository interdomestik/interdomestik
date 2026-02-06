import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

/**
 * Agent Pro Scaffold Test
 *
 * Tests the ability to switch between Lite and Pro agent workspaces.
 */
test.describe('Agent Pro Scaffold (Golden)', () => {
  test('Agent can navigate to Pro workspace', async ({ agentPage: page }, testInfo) => {
    // 1. Login handled by agentPage fixture (asserts dashboard marker)

    // 2. Navigate to Pro Workspace
    await gotoApp(page, routes.agentWorkspace(testInfo), testInfo, {
      marker: 'agent-pro-shell',
    });
    await expect(page).toHaveURL(/\/agent\/workspace/);

    // 3. Verify main content renders
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();

    // 4. Verify we can navigate to sub-pages
    // Try claims
    await gotoApp(page, routes.agentWorkspaceClaims(testInfo), testInfo, {
      marker: 'agent-claims-pro-page',
    });
    await expect(page).toHaveURL(/\/agent\/workspace\/claims/);

    // Try leads
    await gotoApp(page, routes.agentWorkspaceLeads(testInfo), testInfo, {
      marker: 'agent-leads-pro',
    });
    await expect(page).toHaveURL(/\/agent\/workspace\/leads/);

    // 5. Navigate back to lite dashboard
    await gotoApp(page, routes.agent(testInfo), testInfo, {
      marker: 'agent-members-ready',
    });
    await expect(page).toHaveURL(/\/agent\/members$/);
  });
});
