import { expect, test } from '../fixtures/auth.fixture';

test.describe('Gate: Critical Path › Agent Flow', () => {
  test('Agent can view leads and open details drawer', async ({ agentPage }) => {
    // 1. Navigate to leads page (force locale sq for this project)
    await agentPage.goto('/sq/agent/leads');
    await expect(agentPage).toHaveURL(/\/sq\/agent\/leads/);

    // 2. Determine state (Table or Empty)
    // Wait for either the empty state message or the table to be visible to ensure hydration/load is complete
    const emptyState = agentPage.getByText('No leads found');
    const table = agentPage.locator('[data-testid="ops-table"]');

    await expect(emptyState.or(table)).toBeVisible();

    if (await emptyState.isVisible()) {
      console.log('No leads found. Verifying empty state.');
      await expect(emptyState).toBeVisible();
    } else {
      console.log('Leads found. Verifying table and drawer.');

      // Check for table presence
      const table = agentPage.locator('[data-testid="ops-table"]');
      await expect(table).toBeVisible();

      // Check definition of columns
      await expect(agentPage.getByText('First Name')).toBeVisible();
      await expect(agentPage.getByText('Status')).toBeVisible();

      const rows = agentPage.locator('[data-testid^="ops-row-"]');
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);

      const firstRow = rows.first();
      await firstRow.click();

      // Drawer should open
      const drawer = agentPage.locator('[data-testid="ops-drawer"]');
      await expect(drawer).toBeVisible();
      await expect(agentPage.getByText('Lead Details')).toBeVisible();

      // Actions (OpsActionBar uses button roles)
      // Primary action 'Convert to Client' might be disabled or visible
      // We look for any known action text
      await expect(agentPage.getByRole('button', { name: /Convert to Client/i })).toBeVisible();
    }
  });
});
