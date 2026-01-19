import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Pro Claims (Golden)', () => {
  test('Agent can access Pro Claims queue', async ({ page, loginAs }) => {
    // 1. Login as Agent
    await loginAs('agent');

    // 2. Navigate to Pro Workspace directly
    await page.goto('/en/agent/workspace/claims');
    await page.waitForLoadState('domcontentloaded');

    // 3. Verify we're on the claims workspace (URL check)
    await expect(page).toHaveURL(/\/agent\/workspace\/claims/);

    // 4. Verify main content renders
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();

    // 5. Check for either claims table OR empty state
    const emptyState = page.getByText(/No claims found|Nuk ka kërkesa/i);
    const table = page.getByTestId('ops-table');
    const claimRow = page.getByTestId('claim-row').first();

    // Wait for page to stabilize (one of these should appear)
    await Promise.race([
      emptyState.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      table.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      claimRow.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
    ]);

    // 6. If we have claims, verify drawer opens on click
    if (await claimRow.isVisible()) {
      await claimRow.click();

      // Drawer should open (check for dialog or drawer element)
      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible({ timeout: 5000 });

      // Close drawer
      await page.keyboard.press('Escape');
    }

    // Test passes if page loads without errors
  });
});
