import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Pro Leads (Golden)', () => {
  test('Agent can access Pro Leads worklist and see advanced columns', async ({
    agentPage: page,
  }, testInfo) => {
    // 1. Navigate to Pro Workspace
    await gotoApp(page, routes.agentWorkspace(testInfo), testInfo, { marker: 'agent-pro-shell' });

    // 2. Click "Open Leads"
    await page.getByTestId('agent-pro-open-leads-link').evaluate(el => (el as HTMLElement).click());
    await expect(page).toHaveURL(new RegExp(`.*${routes.agentWorkspaceLeads(testInfo)}`));
    await expect(page.getByTestId('agent-leads-pro')).toBeVisible();

    // 3. Verify Pro UI Elements
    // Filters Bar
    await expect(page.getByTestId('ops-filters-bar')).toBeVisible();
    await expect(page.getByTestId('leads-pro-search')).toBeVisible();

    // Pro Columns (Header check)
    // We check for column headers that are specific to Pro view
    await expect(page.getByTestId('ops-col-lead')).toBeVisible();
    await expect(page.getByTestId('ops-col-details')).toBeVisible();

    // 4. Verify Filters
    await expect(page.getByTestId('ops-tab-all')).toBeVisible();
  });
});
