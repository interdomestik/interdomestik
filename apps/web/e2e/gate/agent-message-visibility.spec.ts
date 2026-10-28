import type { Browser, Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { credsFor } from '../fixtures/auth-users';
import { getProjectUrlInfo, ipForRole } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import {
  withAgentMessageFixture,
  type AgentMessageFixture,
} from './agent-message-visibility.fixture';
import {
  withRestrictedAgentClaimsRole,
  type RestrictedRoleHandle,
} from './test/agent-claims-restricted-role';

async function runWithoutMessageSelect(role: RestrictedRoleHandle, fixture: AgentMessageFixture) {
  await role.setClaimMessagesSelect(false);
  try {
    return await role.runReader(fixture, 'failure');
  } finally {
    await role.setClaimMessagesSelect(true);
  }
}

async function signInFixtureAgent(page: Page, info: TestInfo, email: string, agentId: string) {
  const { origin } = getProjectUrlInfo(info, null);
  await page.context().clearCookies();
  const login = await page.request.post(`${origin}/api/auth/sign-in/email`, {
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
}

// Isolated, cookie-less browser context: selected agent paths must be denied before streaming.
async function assertAnonymousSelectedPathsDenied(
  browser: Browser,
  info: TestInfo,
  memberId: string
) {
  const { origin } = getProjectUrlInfo(info, null);
  const locale = routes.getLocale(info);
  const id = encodeURIComponent(memberId);
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    extraHTTPHeaders: info.project.use.extraHTTPHeaders,
    storageState: { cookies: [], origins: [] },
  });
  try {
    for (const path of [
      `/${locale}/agent/claims`,
      `/${locale}/agent/workspace/claims`,
      `/${locale}/agent/clients/${id}`,
      `/${locale}/agent/members/${id}`,
    ]) {
      const response = await context.request.get(`${origin}${path}`, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(response.headers()['x-auth-guard'], path).toBe('middleware-redirect');
      const location = response.headers()['location'];
      expect(location, path).toBeTruthy();
      expect(new URL(location, origin).pathname, path).toBe(routes.login(info));
    }
  } finally {
    await context.close();
  }
}

test.describe('Agent message visibility', () => {
  // This spec verifies its own synthetic login; it never consumes cached gate identities.
  test.use({ storageState: { cookies: [], origins: [] } });
  test('real agent claim readers keep tenant context under a restricted NOBYPASSRLS role', async ({}, info) => {
    test.setTimeout(360_000);
    await withAgentMessageFixture(info.project.name, async fixture => {
      await withRestrictedAgentClaimsRole(async role => {
        const full = await role.runReader(fixture, 'full');
        expect(full.posture).toEqual({
          currentUserMatches: true,
          superuser: false,
          bypassRls: false,
        });
        expect(full.counts).toMatchObject({
          listClaims: 105,
          workspaceClaims: 100,
          selectedClaims: 100,
          deniedSelections: 3,
          deniedRoles: 6,
          adminFamilyRoles: 3,
          profileClaimsTotal: 105,
          profileOpenClaims: 105,
          profileRecentClaims: 6,
          profileSubscriptions: 1,
          profilePreferences: 1,
          profileActivities: 2,
          profileEmptyProfiles: 1,
          profileForeignChildControls: 3,
          profileForeignDenied: 2,
          profileDeniedMembers: 2,
          profileDeniedViewers: 3,
          profileDeniedRoles: 7,
          profileMissingTenants: 4,
          profileAccessFirst: 1,
          notesRightful: 3,
          notesSameTenantAuthors: 2,
          notesDeniedMembers: 2,
          notesDeniedViewers: 3,
          notesStaffFamily: 2,
          notesDeniedRoles: 7,
          notesAccessFirst: 1,
        });
        const failure = await runWithoutMessageSelect(role, fixture);
        expect(failure.counts).toMatchObject({ listClaims: 105, workspaceRejected: 1 });
        expect(failure.counts).not.toHaveProperty('profileClaimsTotal');
        await info.attach('restricted-role-evidence', {
          body: JSON.stringify({ posture: role.posture, full, failure }),
          contentType: 'application/json',
        });
      });
    });
  });

  test('mounted agent list opens the workspace with public snippets and no internal content', async ({
    page: agentPage,
    browser,
  }, info) => {
    await withAgentMessageFixture(
      info.project.name,
      async ({ agentId, email, claimIds, memberId }) => {
        await assertAnonymousSelectedPathsDenied(browser, info, memberId);
        await signInFixtureAgent(agentPage, info, email, agentId);
        await gotoApp(agentPage, `/${routes.getLocale(info)}/agent/claims`, info, {
          marker: 'agent-claims-page',
        });
        await expect(agentPage.locator('body')).not.toContainText('secret');
        const decline = agentPage.getByTestId('cookie-consent-decline');
        await expect(decline).toHaveCount(1);
        await decline.click();
        await expect(agentPage.getByTestId('cookie-consent-banner')).toHaveCount(0);

        const link = agentPage.locator(
          `a[data-testid="agent-claim-row"][href$="claimId=${encodeURIComponent(claimIds[0])}"]`
        );
        await expect(link).toHaveCount(1);
        await link.click();
        await agentPage.waitForURL(
          url =>
            url.pathname.endsWith('/agent/workspace/claims') &&
            url.searchParams.get('claimId') === claimIds[0]
        );

        const workspace = agentPage.locator('[data-testid="agent-claims-pro-page"]:visible');
        const drawer = agentPage.locator('[data-testid="ops-drawer"]:visible');
        const rowFor = (id: string) =>
          workspace
            .getByRole('row', { includeHidden: true })
            .filter({ has: agentPage.getByText(id, { exact: true }) });
        const assertSelectedWorkspace = async () => {
          await expect(workspace).toBeVisible();
          const row = rowFor(claimIds[0]);
          await expect(row).toContainText('S1 public agent reply');
          await expect(row.getByTestId(`unread-badge-${claimIds[0]}`)).toHaveText('1');
          await expect(drawer.getByTestId('workspace-selected-claim-id')).toHaveText(claimIds[0]);
          for (const index of [1, 2, 3]) {
            await expect(rowFor(claimIds[index])).toBeVisible();
            await expect(workspace.getByTestId(`unread-badge-${claimIds[index]}`)).toHaveCount(0);
          }
          await expect(agentPage.locator('body')).not.toContainText('secret');
          await expect(agentPage.locator('body')).not.toContainText('S1 unspecified visibility');
        };
        // The selected page passes isAgent but not allowInternal: the composer is public-only.
        const assertPublicOnlyComposer = async () => {
          const open = drawer.getByTestId('action-message');
          await expect(open).toHaveCount(1);
          await open.click();
          await expect(agentPage.locator('[data-testid="message-input"]:visible')).toHaveCount(1);
          await expect(agentPage.locator('[data-testid="internal-note-toggle"]')).toHaveCount(0);
          await expect(agentPage.getByTestId('messaging-panel')).toBeVisible();
          await expect(agentPage.getByTestId('messaging-panel')).toHaveAttribute(
            'aria-busy',
            'false'
          );
          await expect(agentPage.getByTestId('messaging-public-audience')).toBeVisible();
          const close = agentPage.locator('[data-testid="close-messaging-view"]:visible');
          await expect(close).toHaveCount(1);
          await close.click();
          await expect(agentPage.locator('[data-testid="message-input"]')).toHaveCount(0);
        };
        await assertSelectedWorkspace();

        await agentPage.reload();
        await assertSelectedWorkspace();
        // Opening history records read receipts; preserve the earlier unread/reload assertions first.
        await assertPublicOnlyComposer();

        await gotoApp(
          agentPage,
          `${routes.agentWorkspaceClaims(info)}?claimId=${claimIds[104]}`,
          info,
          { marker: 'agent-claims-pro-page' }
        );
        await expect(workspace).toBeVisible();
        await expect(drawer.getByTestId('workspace-selected-claim-id')).toHaveText(claimIds[104]);
        await expect(workspace.getByTestId(`unread-badge-${claimIds[104]}`)).toHaveText('1');
        await expect(agentPage.locator('body')).toContainText('S1 selected public');
        await expect(agentPage.locator('body')).not.toContainText('secret');
      }
    );
  });
});
