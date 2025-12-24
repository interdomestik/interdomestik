import { expect, test } from './fixtures/auth.fixture';

test.describe('Agent Role Access', () => {
  test('Agent is redirected away from staff claims queue', async ({ agentPage: page }) => {
    await page.goto('/en/staff/claims');
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).not.toContain('/staff/claims');
  });

  test('Agent can access CRM dashboard', async ({ agentPage: page }) => {
    await page.goto('/en/agent/crm');
    await page.waitForLoadState('domcontentloaded');

    // Check for CRM elements
    // Note: Title might be "CRM Overview" or "Dashboard" depending on translation exact key
    // We check for the stats cards which are distinctive
    await expect(page.getByText('New (Submitted)')).toBeVisible();
    await expect(page.getByText('In Verification')).toBeVisible();
  });

  test('Agent can see Leaderboard', async ({ agentPage: page }) => {
    await page.goto('/en/agent/crm');

    // Check Leaderboard Card
    await expect(page.getByText('Top Agents')).toBeVisible();

    // Check Tabs
    await expect(page.getByRole('tab', { name: 'Week' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Month' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'All Time' })).toBeVisible();
  });
});
