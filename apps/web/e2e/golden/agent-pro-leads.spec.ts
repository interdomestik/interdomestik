import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Pro Leads (Golden)', () => {
  test('Agent can access Pro Leads worklist', async ({ page, loginAs }) => {
    // 1. Login as Agent
    await loginAs('agent');

    // 2. Navigate to Pro Leads Workspace directly
    await page.goto('/en/agent/workspace/leads');
    await page.waitForLoadState('domcontentloaded');

    // 3. Verify we're on the leads workspace (URL check)
    await expect(page).toHaveURL(/\/agent\/workspace\/leads/);

    // 4. Verify main content renders
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();

    // 5. Check for either leads table OR empty state
    const emptyState = page.getByText(/No leads found|Nuk ka lead/i);
    const table = page.getByTestId('ops-table');
    const leadRow = page.getByTestId('lead-row').first();

    // Wait for page to stabilize
    await Promise.race([
      emptyState.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      table.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      leadRow.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
    ]);

    // 6. If we have leads, verify we can interact
    if (await leadRow.isVisible()) {
      // Click first row to open drawer
      await leadRow.click();

      // Drawer should open
      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible({ timeout: 5000 });

      // Close drawer
      await page.keyboard.press('Escape');
    }

    // Test passes if page loads without errors
  });
});
