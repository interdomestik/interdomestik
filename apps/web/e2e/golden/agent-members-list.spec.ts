import { db, eq, user } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Members List', () => {
  test('Agent can view assigned members and cannot open unassigned member', async ({
    agentPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.agentMembers(testInfo), testInfo, {
      marker: 'dashboard-page-ready',
    });

    await expect(page.getByTestId('agent-members-list')).toBeVisible();
    const firstRow = page.getByTestId('agent-member-row').first();
    await expect(firstRow).toBeVisible();

    await firstRow.getByTestId('agent-member-link').click();
    await expect(page.getByTestId('member-header')).toBeVisible();

    const unassigned = await db.query.user.findFirst({
      where: eq(user.email, 'member.ks.b1@interdomestik.com'),
      columns: { id: true },
    });

    if (!unassigned?.id) {
      throw new Error('Expected seeded unassigned member to exist');
    }

    await gotoApp(page, routes.agentMemberDetail(unassigned.id, testInfo), testInfo, {
      marker: 'not-found-page',
    });
    await expect(page.getByTestId('not-found-page')).toBeVisible();
  });
});
