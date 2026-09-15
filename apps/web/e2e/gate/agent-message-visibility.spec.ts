import { db } from '@interdomestik/database';
import { getAgentWorkspaceClaimsCore } from '../../src/app/[locale]/(agent)/agent/workspace/claims/_core';
import { expect, test } from '../fixtures/auth.fixture';
import { credsFor } from '../fixtures/auth-users';
import { getProjectUrlInfo, ipForRole } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withAgentMessageFixture } from './agent-message-visibility.fixture';

test.describe('Agent message visibility', () => {
  test('real query excludes internal metadata and preserves scope, ordering and selection', async ({}, info) => {
    await withAgentMessageFixture(info.project.name, async fixture => {
      const { agentId: userId, tenantId, claimIds, deniedIds } = fixture;
      const read = (selectedClaimId?: string) =>
        getAgentWorkspaceClaimsCore({ db, userId, tenantId, selectedClaimId });
      for (const invalidTenantId of ['', ` ${tenantId} `]) {
        const denied = await getAgentWorkspaceClaimsCore({ db, userId, tenantId: invalidTenantId });
        expect(denied.claims).toEqual([]);
      }
      const initial = await read();
      expect(initial.claims.map(claim => claim.id)).toEqual(claimIds.slice(0, 100));
      expect(initial.claims[0]).toMatchObject({
        lastMessage: 'S1 public agent reply',
        unreadCount: 1,
        policy: null,
      });
      for (const index of [1, 2, 3]) {
        expect(initial.claims[index]).toMatchObject({ lastMessage: null, unreadCount: 0 });
      }
      const selected = await read(` ${claimIds[104]} `);
      expect(selected.claims.map(claim => claim.id)).toEqual([
        ...claimIds.slice(0, 99),
        claimIds[104],
      ]);
      expect(selected.claims[99]).toMatchObject({
        lastMessage: 'S1 selected public',
        unreadCount: 1,
      });
      for (const selectedClaimId of deniedIds) {
        const denied = await read(selectedClaimId);
        expect(denied.claims.map(claim => claim.id)).toEqual(claimIds.slice(0, 100));
      }
      expect(JSON.stringify([initial, selected])).not.toMatch(/secret|unspecified visibility/);
    });
  });

  test('mounted workspace renders public snippets and excludes internal counts and content', async ({
    page: agentPage,
  }, info) => {
    await withAgentMessageFixture(info.project.name, async ({ agentId, email, claimIds }) => {
      const { origin } = getProjectUrlInfo(info, null);
      await agentPage.context().clearCookies();
      const login = await agentPage.request.post(`${origin}/api/auth/sign-in/email`, {
        data: {
          email,
          password: credsFor('agent', info.project.name.includes('mk') ? 'mk' : 'ks').password,
        },
        headers: {
          Origin: origin,
          'x-forwarded-for': ipForRole('agent'),
          ...info.project.use.extraHTTPHeaders,
        },
      });
      expect(login.ok()).toBeTruthy();
      expect((await login.json()).user.id).toBe(agentId);
      await gotoApp(agentPage, routes.agentWorkspaceClaims(info), info, {
        marker: 'agent-claims-pro-page',
      });
      const workspace = agentPage.locator('[data-testid="agent-claims-pro-page"]:visible').last();
      const rowFor = (id: string) =>
        workspace.getByRole('row').filter({
          has: agentPage.getByText(id, { exact: true }),
        });
      const row = rowFor(claimIds[0]);
      await expect(row).toContainText('S1 public agent reply');
      await expect(row.getByTestId(`unread-badge-${claimIds[0]}`)).toHaveText('1');
      for (const index of [1, 2, 3]) {
        await expect(rowFor(claimIds[index])).toBeVisible();
        await expect(workspace.getByTestId(`unread-badge-${claimIds[index]}`)).toHaveCount(0);
      }
      await expect(agentPage.locator('body')).not.toContainText('secret');
      await expect(agentPage.locator('body')).not.toContainText('S1 unspecified visibility');
      await gotoApp(
        agentPage,
        `${routes.agentWorkspaceClaims(info)}?claimId=${claimIds[104]}`,
        info,
        {
          marker: 'agent-claims-pro-page',
        }
      );
      const drawer = agentPage.locator('[data-testid="ops-drawer"]:visible').last();
      await expect(drawer.getByTestId('workspace-selected-claim-id')).toHaveText(claimIds[104]);
      await expect(workspace.getByTestId(`unread-badge-${claimIds[104]}`)).toHaveText('1');
      await expect(agentPage.locator('body')).toContainText('S1 selected public');
      await expect(agentPage.locator('body')).not.toContainText('secret');
    });
  });
});
