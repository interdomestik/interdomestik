import { E2E_USERS } from '@interdomestik/database';
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Agent Members Search', () => {
  test('agent can search members by name and see empty state', async ({
    page,
    loginAs,
  }, testInfo) => {
    const isMk = testInfo.project.name.includes('mk');
    const seededMember = isMk ? E2E_USERS.MK_MEMBER : E2E_USERS.KS_MEMBER;
    const searchTerm = seededMember.name;
    const encodedSearchTerm = encodeURIComponent(searchTerm).replace(/%20/g, '+');
    const escapedSearchTerm = encodedSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    await loginAs('agent');

    await gotoApp(page, routes.agentMembers(testInfo), testInfo, {
      marker: 'agent-members-list',
    });

    const searchInput = page.getByTestId('agent-members-search-input');
    await searchInput.fill(searchTerm);

    await expect(page).toHaveURL(new RegExp(`[?&]q=${escapedSearchTerm}`));
    await expect(page.getByTestId('agent-members-list')).toBeVisible();
    await expect(page.getByText(seededMember.name)).toBeVisible();

    await searchInput.fill('no-such-member');
    await expect(page).toHaveURL(/q=no-such-member/);
    await expect(page.getByTestId('agent-members-no-results')).toBeVisible();

    await searchInput.fill('');
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByTestId('agent-members-list')).toBeVisible();
  });
});
