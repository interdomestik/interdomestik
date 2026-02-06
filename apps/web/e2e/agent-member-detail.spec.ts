import { agentClients, and, db, eq, user } from '@interdomestik/database';
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Agent Member Detail', () => {
  test('agent can view assigned member detail', async ({ agentPage: page }, testInfo) => {
    const agent = await db.query.user.findFirst({
      where: eq(user.email, 'agent.ks.a1@interdomestik.com'),
      columns: { id: true, tenantId: true },
    });

    if (!agent?.id || !agent.tenantId) {
      throw new Error('Expected seeded agent to exist');
    }

    const assignment = await db.query.agentClients.findFirst({
      where: and(eq(agentClients.agentId, agent.id), eq(agentClients.tenantId, agent.tenantId)),
      columns: { id: true, memberId: true },
      with: {
        member: { columns: { id: true, name: true } },
      },
    });

    if (!assignment?.member?.id) {
      throw new Error('Expected seeded assignment to exist');
    }

    await gotoApp(page, routes.agentMembers(testInfo), testInfo, {
      marker: 'agent-members-list',
    });

    const viewCell = page.getByTestId('agent-member-view-cell').first();
    await viewCell.getByRole('link', { name: 'View member' }).click();

    await expect(page.getByTestId('agent-member-detail-ready')).toBeVisible();
    const header = page.getByTestId('agent-member-detail-header');
    await expect(header).toBeVisible();
    await expect(header).toHaveText(/.+/);

    const claimsSection = page.getByTestId('agent-member-detail-claims');
    await expect(claimsSection).toBeVisible();

    const noClaims = page.getByTestId('agent-member-detail-no-claims');
    const firstRow = claimsSection.locator('tbody tr').first();

    const hasNoClaims = await noClaims.isVisible().catch(() => false);
    if (!hasNoClaims) {
      await expect(firstRow).toBeVisible();
    }
  });

  test('agent cannot access unassigned member', async ({ agentPage: page }, testInfo) => {
    const member = await db.query.user.findFirst({
      where: eq(user.email, 'member.ks.b1@interdomestik.com'),
      columns: { id: true },
    });

    if (!member?.id) {
      throw new Error('Expected seeded unassigned member to exist');
    }

    await gotoApp(page, routes.agentMemberDetail(member.id, testInfo), testInfo, {
      marker: 'not-found-page',
    });

    await expect(page.getByTestId('not-found-page')).toBeVisible();
  });
});
