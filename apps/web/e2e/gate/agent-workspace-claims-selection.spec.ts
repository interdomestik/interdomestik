import { E2E_USERS, claims, db, eq, user } from '@interdomestik/database';
import { and, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

function isMkProject(testInfo: import('@playwright/test').TestInfo): boolean {
  return testInfo.project.name.includes('mk');
}

test.describe('Agent Workspace Claims claimId selection', () => {
  test('claimId selects accessible claim and flags inaccessible claimId', async ({
    agentPage: page,
  }, testInfo) => {
    const agentEmail = isMkProject(testInfo) ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;

    const seededAgent = await db.query.user.findFirst({
      where: eq(user.email, agentEmail),
      columns: { tenantId: true, branchId: true },
    });

    if (!seededAgent?.tenantId) {
      throw new Error(`Expected seeded agent with tenant context for ${agentEmail}`);
    }

    const accessibleClaimId = await db.query.claims.findFirst({
      where: seededAgent.branchId
        ? and(
            eq(claims.tenantId, seededAgent.tenantId),
            or(eq(claims.branchId, seededAgent.branchId), isNull(claims.branchId))
          )
        : eq(claims.tenantId, seededAgent.tenantId),
      columns: { id: true },
    });

    if (!accessibleClaimId?.id) {
      throw new Error(`Expected at least one accessible claimId for ${agentEmail}`);
    }

    const accessiblePath = `${routes.agentWorkspaceClaims(
      testInfo
    )}?claimId=${encodeURIComponent(accessibleClaimId.id)}`;

    await gotoApp(page, accessiblePath, testInfo, { marker: 'agent-claims-pro-page' });

    await expect(page.getByTestId('workspace-selected-claim-id')).toBeVisible();
    await expect(page.getByTestId('workspace-selected-claim-id')).toHaveText(accessibleClaimId.id);
    await expect(page.getByTestId('ops-drawer')).toBeVisible();
    await expect(page.getByTestId('ops-drawer-content')).toBeVisible();
    await expect(page.getByTestId('action-message')).toBeVisible();

    let inaccessibleClaim = seededAgent.branchId
      ? await db.query.claims.findFirst({
          where: and(
            eq(claims.tenantId, seededAgent.tenantId),
            isNotNull(claims.branchId),
            ne(claims.branchId, seededAgent.branchId)
          ),
          columns: { id: true },
        })
      : null;

    if (!inaccessibleClaim?.id) {
      inaccessibleClaim = await db.query.claims.findFirst({
        where: ne(claims.tenantId, seededAgent.tenantId),
        columns: { id: true },
      });
    }

    if (!inaccessibleClaim?.id) {
      throw new Error('Expected at least one inaccessible claimId in seeded data');
    }

    const inaccessiblePath = `${routes.agentWorkspaceClaims(
      testInfo
    )}?claimId=${encodeURIComponent(inaccessibleClaim.id)}`;

    await gotoApp(page, inaccessiblePath, testInfo, { marker: 'agent-claims-pro-page' });

    await expect(page.getByTestId('workspace-claim-not-accessible')).toBeVisible();
    await expect(page.getByTestId('workspace-selected-claim-id')).toHaveCount(0);
  });

  test('message persists after reload when opening claim by claimId', async ({
    agentPage: page,
  }, testInfo) => {
    const agentEmail = isMkProject(testInfo) ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;

    const seededAgent = await db.query.user.findFirst({
      where: eq(user.email, agentEmail),
      columns: { tenantId: true, branchId: true },
    });

    if (!seededAgent?.tenantId) {
      throw new Error(`Expected seeded agent with tenant context for ${agentEmail}`);
    }

    const accessibleClaim = await db.query.claims.findFirst({
      where: seededAgent.branchId
        ? and(
            eq(claims.tenantId, seededAgent.tenantId),
            or(eq(claims.branchId, seededAgent.branchId), isNull(claims.branchId))
          )
        : eq(claims.tenantId, seededAgent.tenantId),
      columns: { id: true },
    });

    if (!accessibleClaim?.id) {
      throw new Error(`Expected at least one accessible claimId for ${agentEmail}`);
    }

    const targetUrl = `${routes.agentWorkspaceClaims(testInfo)}?claimId=${encodeURIComponent(
      accessibleClaim.id
    )}`;

    await gotoApp(page, targetUrl, testInfo, { marker: 'agent-claims-pro-page' });

    await expect(page.getByTestId('workspace-selected-claim-id')).toBeVisible();
    await expect(page.getByTestId('workspace-selected-claim-id')).toHaveText(accessibleClaim.id);
    const actionMessage = page.getByTestId('action-message');
    await expect(actionMessage).toBeVisible();

    // Open messaging panel for deterministic claim context.
    await actionMessage.evaluate(el => (el as HTMLElement).click());
    const messagingPanel = page.locator('[data-testid="messaging-panel"]:visible');
    await expect(messagingPanel).toBeVisible({ timeout: 15000 });

    const uniqueText = `E2E persistence ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
    const messageInput = messagingPanel.getByTestId('message-input');
    await messageInput.fill(uniqueText);

    const sendButton = messagingPanel.getByTestId('send-message-button');
    await expect(sendButton).toBeEnabled();
    await sendButton.evaluate(el => (el as HTMLElement).click());

    const sentMessage = messagingPanel
      .locator('p.whitespace-pre-wrap')
      .filter({ hasText: uniqueText });
    await expect(sentMessage).toBeVisible({ timeout: 10000 });

    await page.reload();

    await expect(page.getByTestId('workspace-selected-claim-id')).toBeVisible();
    await expect(page.getByTestId('workspace-selected-claim-id')).toHaveText(accessibleClaim.id);

    const actionMessageAfterReload = page.getByTestId('action-message');
    await expect(actionMessageAfterReload).toBeVisible();
    await actionMessageAfterReload.evaluate(el => (el as HTMLElement).click());

    const refreshedMessagingPanel = page.locator('[data-testid="messaging-panel"]:visible');
    await expect(refreshedMessagingPanel).toBeVisible({ timeout: 15000 });
    await expect(
      refreshedMessagingPanel.locator('p.whitespace-pre-wrap').filter({ hasText: uniqueText })
    ).toBeVisible({ timeout: 10000 });
  });
});
