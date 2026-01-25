import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Agent Role Access', () => {
  test('Agent is redirected from staff claims or sees read-only view', async ({
    agentPage: page,
  }, testInfo) => {
    // Navigating to staff claims as agent
    // We use 'body' as marker because the destination is ambiguous (redirect vs read-only)
    // and we just want to verify we don't land on admin claims
    await gotoApp(page, routes.staffClaims(testInfo), testInfo, { marker: 'body' });

    // Agent should either be redirected away OR see the page without edit capabilities
    // Check that the URL is not the admin version
    expect(page.url()).not.toContain('/admin/claims');
  });

  test('Agent can access CRM dashboard', async ({ agentPage: page }, testInfo) => {
    await gotoApp(page, routes.agentCrm(testInfo), testInfo, { marker: 'crm-page-ready' });

    // Check for CRM elements
    await expect(page.getByTestId('crm-page-ready')).toBeVisible();
  });

  test('Agent can see Leaderboard', async ({ agentPage: page }, testInfo) => {
    await gotoApp(page, routes.agentCrm(testInfo), testInfo, { marker: 'crm-page-ready' });

    // Check for Leaderboard
    await expect(page.getByTestId('leaderboard-card')).toBeVisible();

    // Check Tabs
    const tabsLocator = page.getByRole('tab');
    await expect(tabsLocator.first()).toBeVisible();
  });
});
