import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Agent My Members MVP', () => {
  test('seeded agent sees members list and can open owned member context', async ({
    agentPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.agentMembers(testInfo), testInfo, {
      marker: 'agent-members-list',
    });

    await expect(page.getByTestId('agent-members-list')).toBeVisible();
    await expect(page.getByTestId('agent-member-row').first()).toBeVisible();
    await expect(page.getByTestId('agent-member-view-link').first()).toHaveText('View member');

    await page.getByTestId('agent-member-view-link').first().click();

    await expect(page).toHaveURL(/\/agent\/members\/[^/]+$/);
    await expect(page.getByTestId('agent-member-detail-ready')).toBeVisible();
  });
});
