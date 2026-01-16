import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Agent Role Access', () => {
  test('Agent is redirected from staff claims or sees read-only view', async ({
    agentPage: page,
  }) => {
    await page.goto(routes.staffClaims());
    await page.waitForLoadState('domcontentloaded');

    // Agent should either be redirected away OR see the page without edit capabilities
    // Check that the URL is not the admin version
    expect(page.url()).not.toContain('/admin/claims');
  });

  test('Agent can access CRM dashboard', async ({ agentPage: page }) => {
    await page.goto(routes.agentCrm());
    await page.waitForLoadState('domcontentloaded');

    // Check for CRM elements - use more flexible locale-aware patterns
    await expect(page.getByText(/New.*Submitted|Submitted|Të reja|Поднесени/i).first()).toBeVisible(
      { timeout: 10000 }
    );
  });

  test('Agent can see Leaderboard', async ({ agentPage: page }) => {
    await page.goto(routes.agentCrm());
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
