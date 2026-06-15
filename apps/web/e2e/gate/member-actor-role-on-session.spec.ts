import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('T-304 actor_role_on_session', () => {
  test('agent entering member route exercises member navigation scope only', async ({
    agentPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(testInfo), testInfo, {
      marker: 'dashboard-page-ready',
      markerTimeoutMs: 30_000,
    });

    await expect(page.getByTestId('member-dashboard-ready').first()).toBeVisible();
    await expect(page.locator('a[href$="/member"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/agent"]')).toHaveCount(0);
  });
});
