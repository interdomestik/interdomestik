import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Home Lite (Golden)', () => {
  test('Agent can view home dashboard and navigate to leads', async ({ page, loginAs }) => {
    // 1. Login as Agent
    await loginAs('agent');

    // 2. Land on /agent (automatically)
    await expect(page).toHaveURL(/\/agent/);
    await page.waitForLoadState('domcontentloaded');

    // 3. Verify Home Page Content
    const agentHome = page.getByTestId('agent-home');
    await expect(agentHome).toBeVisible({ timeout: 10000 });

    // Verify Tiles exist
    const newLeadsTile = page.getByTestId('agent-tile-new-leads');
    await expect(newLeadsTile).toBeVisible();

    const followUpsTile = page.getByTestId('agent-tile-followups');
    await expect(followUpsTile).toBeVisible();

    const activeClaimsTile = page.getByTestId('agent-tile-active-claims');
    await expect(activeClaimsTile).toBeVisible();

    // 4. Test Navigation: "My New Leads" -> /agent/leads
    await newLeadsTile.click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/agent\/leads/);

    // Verify we landed on leads page - check main content loaded
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();

    // Check for either the leads lite UI or ops table
    const leadsLite = page.getByTestId('agent-leads-lite');
    const opsTable = page.getByTestId('ops-table');

    await Promise.race([
      leadsLite.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      opsTable.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
    ]);

    // At least one should be visible
    const isLeadsLite = await leadsLite.isVisible();
    const isOpsTable = await opsTable.isVisible();
    expect(isLeadsLite || isOpsTable).toBeTruthy();
  });
});
