import { expect, test } from '../fixtures/auth.fixture';

test.describe('Gate: Critical Path › Agent Flow', () => {
  test('Agent can view leads and open details drawer', async ({ agentPage }) => {
    // 1. Navigate to leads page (force locale sq for this project)
    await agentPage.goto('/sq/agent/leads');
    await expect(agentPage).toHaveURL(/\/sq\/agent\/leads/);

    // 2. Check for table presence
    const table = agentPage.locator('[data-testid="ops-table"]');
    await expect(table).toBeVisible();

    // 3. Check definition of columns
    await expect(agentPage.getByText('First Name')).toBeVisible();
    await expect(agentPage.getByText('Status')).toBeVisible();

    // 4. Check interaction (Drawer)
    // We might have seeded data or empty state.
    // If empty state, we verify that. If rows, we verify click.
    const rows = agentPage.locator('[data-testid^="ops-row-"]');
    const count = await rows.count();

    if (count > 0) {
      console.log(`Found ${count} leads. Testing drawer interaction.`);
      const firstRow = rows.first();
      await firstRow.click();

      // Drawer should open
      const drawer = agentPage.locator('[data-testid="ops-drawer"]');
      await expect(drawer).toBeVisible();
      await expect(agentPage.getByText('Lead Details')).toBeVisible();

      // Actions
      await expect(agentPage.getByRole('button', { name: /Convert to Client/i })).toBeVisible();
    } else {
      console.log('No leads found. Verifying empty state.');
      await expect(agentPage.getByText('No leads found')).toBeVisible();
    }
  });
});
