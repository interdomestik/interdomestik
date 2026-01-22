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
    await page.getByRole('button', { name: /Open Leads/i }).click();
    await expect(page).toHaveURL(new RegExp(`.*${routes.agentWorkspaceLeads(testInfo)}`));
    await expect(page.getByTestId('agent-leads-pro')).toBeVisible();

    // 3. Verify Pro UI Elements
    // Filters Bar
    await expect(page.getByTestId('ops-filters-bar')).toBeVisible();
    await expect(page.getByTestId('leads-pro-search')).toBeVisible();

    // Pro Columns (Header check)
    // We check for column headers that are specific to Pro view
    await expect(page.getByRole('columnheader', { name: /Lead Name & Email/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Phone & Branch/i })).toBeVisible();

    // 4. Verify Filters (Click a tab)
    const convertedTab = page.getByTestId('ops-tab-converted');
    // Use evaluate click to avoid "detached from DOM" flake during list re-renders
    await convertedTab.evaluate(el => (el as HTMLElement).click());

    // UI should reflect active state
    await expect(convertedTab).toHaveClass(/bg-.*primary/);

    // 5. Navigate back to Workspace
    await page
      .getByRole('button', { name: /ArrowLeft/i })
      .or(page.locator('button .lucide-arrow-left'))
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`.*${routes.agentWorkspace(testInfo)}`));
    await expect(page.getByTestId('agent-pro-shell')).toBeVisible();
  });
});
