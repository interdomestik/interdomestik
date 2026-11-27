import { E2E_USERS, db, eq, user } from '@interdomestik/database';
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

    // React streaming can briefly hold a hidden copy of the page (<div hidden id="S:n">) outside the
    // shell before it swaps it in, so scope reads to the role shell (gate-mk-mk, 2026-11-27).
    const shell = page.getByTestId('role-shell');
    await expect(shell.getByTestId('agent-members-list')).toBeVisible();
    const firstRow = shell.getByTestId('agent-member-row').first();
    await expect(firstRow).toBeVisible();

    await Promise.all([
      page.waitForURL(/\/agent\/members\/[^/]+$/),
      firstRow.getByTestId('agent-member-link').click(),
    ]);
    await expect(shell.getByTestId('agent-member-detail-ready')).toBeVisible();

    const unassigned = await db.query.user.findFirst({
      where: eq(user.email, E2E_USERS.KS_MEMBER_B1.email),
      columns: { id: true },
    });

    if (!unassigned?.id) {
      throw new Error('Expected seeded unassigned member to exist');
    }

    await gotoApp(page, routes.agentMemberDetail(unassigned.id, testInfo), testInfo, {
      marker: 'not-found-page',
    });
    await expect(page.getByTestId('not-found-page').filter({ visible: true })).toBeVisible();
  });
});
