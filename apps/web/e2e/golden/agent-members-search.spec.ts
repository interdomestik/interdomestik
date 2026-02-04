import { agentClients, and, db, eq, user } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Members Search', () => {
  test('Agent can search assigned members and see no-results state', async ({
    agentPage: page,
  }, testInfo) => {
    const agent = await db.query.user.findFirst({
      where: eq(user.email, 'agent.ks.a1@interdomestik.com'),
      columns: { id: true, tenantId: true },
    });

    const member = await db.query.user.findFirst({
      where: eq(user.email, 'member.ks.a1@interdomestik.com'),
      columns: { id: true, name: true, memberNumber: true },
    });

    if (!agent?.id || !agent.tenantId) {
      throw new Error('Expected seeded agent to exist');
    }

    if (!member?.id) {
      throw new Error('Expected seeded member to exist');
    }

    const assignment = await db.query.agentClients.findFirst({
      where: and(eq(agentClients.agentId, agent.id), eq(agentClients.memberId, member.id)),
      columns: { id: true },
    });

    if (!assignment?.id) {
      throw new Error('Expected seeded agent assignment to exist');
    }

    await gotoApp(page, routes.agentMembers(testInfo), testInfo, {
      marker: 'dashboard-page-ready',
    });

    const searchInput = page.getByTestId('agent-members-search-input');
    const searchSubmit = page.getByTestId('agent-members-search-submit');

    const searchTerm = member.memberNumber ?? member.name.split(' ')[0] ?? 'member';

    await searchInput.fill(searchTerm);
    await searchSubmit.click();

    await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(searchTerm)}`));
    await expect(page.getByTestId('agent-members-list')).toBeVisible();
    await expect(page.getByText(member.name)).toBeVisible();

    await searchInput.fill('no-results-xyz');
    await searchSubmit.click();

    await expect(page).toHaveURL(/q=no-results-xyz/);
    await expect(page.getByTestId('agent-members-no-results')).toBeVisible();
  });
});
