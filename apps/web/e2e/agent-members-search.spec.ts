import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Agent Members Search', () => {
  test('agent can search members by name and see empty state', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginAs('agent');

    await gotoApp(page, routes.agentMembers(testInfo), testInfo, {
      marker: 'agent-members-list',
    });

    const searchInput = page.getByTestId('agent-members-search-input');
    await searchInput.fill('KS A-Member 1');

    await expect(page).toHaveURL(/q=KS\+A-Member\+1/);
    await expect(page.getByTestId('agent-members-list')).toBeVisible();
    await expect(page.getByText('KS A-Member 1')).toBeVisible();

    await searchInput.fill('no-such-member');
    await expect(page).toHaveURL(/q=no-such-member/);
    await expect(page.getByTestId('agent-members-no-results')).toBeVisible();

    await searchInput.fill('');
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByTestId('agent-members-list')).toBeVisible();
  });
});
