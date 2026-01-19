import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Pro Leads (Golden)', () => {
  test('Agent can access Pro Leads worklist and see advanced columns', async ({
    page,
    loginAs,
  }) => {
    // 1. Login as Agent
    await loginAs('agent');

    // 2. Navigate to Pro Workspace
    await page.goto('/en/agent/workspace');
    await expect(page).toHaveURL(/\/agent\/workspace/);

    // 3. Click "Open Leads"
    await page.getByRole('link', { name: 'Open Leads' }).click();
    await expect(page).toHaveURL(/\/agent\/workspace\/leads/);

    // 4. Verify Pro UI Elements
    // Filters Bar
    await expect(page.getByTestId('filters-bar')).toBeVisible();
    await expect(page.getByPlaceholder('Search leads by name, email, or phone...')).toBeVisible();

    // Pro Columns (Header check)
    await expect(page.getByText('Current Status')).toBeVisible(); // OpsStatusBadge header usually just renders badge in body, header in OpsTable
    // Let's check visually distinct columns from Lite
    // Lite has "Lead" and "Status & Next Step"
    // Pro has "Lead Name & Email", "Status", "Phone & Branch", "Created / Last Touch"

    // We can check for a specific lead row testid and ensure it has more cells or specific text
    // But checking headers is safer if they are rendered as text.
    await expect(page.getByRole('columnheader', { name: 'Lead Name & Email' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Phone & Branch' })).toBeVisible();

    // 5. Verify Filters (Click a tab)
    await page.getByRole('button', { name: 'Converted' }).click();
    // Logic check - URL might not change if local state, but UI should reflect active state
    // We can verify styling or just that it doesn't crash.
    await expect(page.getByRole('button', { name: 'Converted' })).toHaveClass(/bg-primary/); // Default variant usually has primary bg

    // 6. Navigate back to Workspace
    await page
      .getByRole('link', { name: 'Leads Worklist (Pro)' })
      .locator('..')
      .getByRole('button')
      .click(); // Back arrow
    await expect(page).toHaveURL(/\/agent\/workspace/);
  });
});
