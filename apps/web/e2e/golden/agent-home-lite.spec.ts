import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Home Lite (Golden)', () => {
  test('Agent can view home dashboard and navigate to leads', async ({ page, loginAs }) => {
    // 1. Login as Agent
    await loginAs('agent');

    // 2. Land on /agent (automatically)
    await expect(page).toHaveURL(/\/agent$/);

    // 3. Verify Home Page Content
    await expect(page.getByTestId('agent-home')).toBeVisible();

    // Verify Tiles exist
    const newLeadsTile = page.getByTestId('agent-tile-new-leads');
    await expect(newLeadsTile).toBeVisible();
    await expect(newLeadsTile).toHaveText(/My New Leads/);

    const followUpsTile = page.getByTestId('agent-tile-followups');
    await expect(followUpsTile).toBeVisible();

    const activeClaimsTile = page.getByTestId('agent-tile-active-claims');
    await expect(activeClaimsTile).toBeVisible();

    // 4. Test Navigation: "My New Leads" -> /agent/leads
    await newLeadsTile.click();
    await expect(page).toHaveURL(/\/agent\/leads/);

    // Verify we landed on leads page
    await expect(page.getByTestId('agent-leads-lite')).toBeVisible();
  });
});
