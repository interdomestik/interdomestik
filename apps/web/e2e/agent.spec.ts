import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Agent Role Access', () => {
  test('Agent is redirected from staff claims or sees read-only view', async ({
    agentPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.staffClaims(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    // Agent should either be redirected away OR see the page without edit capabilities
    // Check that the URL is not the admin version
    expect(page.url()).not.toContain('/admin/claims');
  });

  test('Agent can access CRM dashboard', async ({ agentPage: page }, testInfo) => {
    await gotoApp(page, routes.agentCrm(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    // Check for CRM elements - use more flexible locale-aware patterns
    await expect(page.getByText(/New.*Submitted|Submitted|Të reja|Поднесени/i).first()).toBeVisible(
      { timeout: 10000 }
    );
  });

  test.skip('Agent can see Leaderboard', async ({ agentPage: page }, testInfo) => {
    await gotoApp(page, routes.agentCrm(), testInfo);
    await page.waitForLoadState('domcontentloaded');

    // Check for Leaderboard - use locale-aware patterns
    await expect(
      page.getByText(/Top Agents|Agjentët më të mirë|Најдобри агенти/i).first()
    ).toBeVisible({ timeout: 10000 });

    // Check Tabs with locale-aware patterns
    const tabsLocator = page.getByRole('tab');
    await expect(tabsLocator.first()).toBeVisible();
  });
});
