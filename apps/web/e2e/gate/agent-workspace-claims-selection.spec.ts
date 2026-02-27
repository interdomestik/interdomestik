import { E2E_USERS, agentClients, claimMessages, claims, db, user } from '@interdomestik/database';
import { and, desc, eq, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

function isMkProject(testInfo: import('@playwright/test').TestInfo): boolean {
  return testInfo.project.name.includes('mk');
}

type AccessibleClaimResult = {
  claimId: string;
  createdFallback: boolean;
};

async function resolveAccessibleClaimId(agentEmail: string): Promise<AccessibleClaimResult> {
  const seededAgent = await db.query.user.findFirst({
    where: eq(user.email, agentEmail),
    columns: { id: true, tenantId: true, branchId: true },
  });

  if (!seededAgent?.tenantId) {
    throw new Error(`Expected seeded agent with tenant context for ${agentEmail}`);
  }

  if (!seededAgent.id) {
    throw new Error(`Expected seeded agent id for ${agentEmail}`);
  }

  const seededAssignment = await db.query.agentClients.findFirst({
    where: and(
      eq(agentClients.tenantId, seededAgent.tenantId),
      eq(agentClients.agentId, seededAgent.id),
      eq(agentClients.status, 'active')
    ),
    columns: { memberId: true },
    orderBy: [desc(agentClients.id)],
  });

  if (!seededAssignment?.memberId) {
    throw new Error(`Expected seeded active assignment for ${agentEmail}`);
  }

  const existing = await db.query.claims.findFirst({
    where: and(
      eq(claims.tenantId, seededAgent.tenantId),
      eq(claims.userId, seededAssignment.memberId),
      eq(claims.status, 'submitted'),
      ...(seededAgent.branchId ? [eq(claims.branchId, seededAgent.branchId)] : [])
    ),
    columns: { id: true },
    orderBy: [desc(claims.createdAt)],
  });

  if (existing?.id) {
    return { claimId: existing.id, createdFallback: false };
  }

  const fallbackClaimId = `e2e-${randomUUID()}`;
  await db.insert(claims).values({
    id: fallbackClaimId,
    tenantId: seededAgent.tenantId,
    userId: seededAssignment.memberId,
    title: `E2E fallback claim ${fallbackClaimId}`,
    companyName: 'Interdomestik QA',
    category: 'vehicle',
    branchId: seededAgent.branchId ?? null,
    status: 'submitted',
  });

  return { claimId: fallbackClaimId, createdFallback: true };
}

async function cleanupFallbackClaim(claimId: string, wasCreatedFallback: boolean): Promise<void> {
  if (!wasCreatedFallback) return;

  try {
    await db.delete(claims).where(eq(claims.id, claimId));
  } catch (error) {
    console.warn(
      `[agent-workspace-e2e] Failed to cleanup fallback claim ${claimId}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

const MESSAGE_PERSISTENCE_PREFIX = 'E2E persistence agent-workspace-claims-selection';

async function cleanupPersistenceMessages(claimId: string, content?: string): Promise<void> {
  try {
    if (content) {
      await db
        .delete(claimMessages)
        .where(and(eq(claimMessages.claimId, claimId), eq(claimMessages.content, content)));
      return;
    }

    await db
      .delete(claimMessages)
      .where(
        and(
          eq(claimMessages.claimId, claimId),
          like(claimMessages.content, `${MESSAGE_PERSISTENCE_PREFIX}%`)
        )
      );
  } catch (error) {
    console.warn(
      `[agent-workspace-e2e] Failed to cleanup persistence messages for claim ${claimId}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function waitForPersistedMessage(claimId: string, content: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const persistedMessage = await db.query.claimMessages.findFirst({
          where: and(eq(claimMessages.claimId, claimId), eq(claimMessages.content, content)),
          columns: { id: true },
        });

        return Boolean(persistedMessage?.id);
      },
      { timeout: 15000, intervals: [250, 500, 1000] }
    )
    .toBe(true);
}

test.describe('Agent Workspace Claims claimId selection', () => {
  test('claimId selects accessible claim and flags inaccessible claimId', async ({
    agentPage: page,
  }, testInfo) => {
    const agentEmail = isMkProject(testInfo) ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;
    const { claimId: accessibleClaimId, createdFallback } =
      await resolveAccessibleClaimId(agentEmail);

    try {
      const accessiblePath = `${routes.agentWorkspaceClaims(
        testInfo
      )}?claimId=${encodeURIComponent(accessibleClaimId)}`;

      await gotoApp(page, accessiblePath, testInfo, { marker: 'agent-claims-pro-page' });

      await expect(page.getByTestId('workspace-selected-claim-id')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('workspace-selected-claim-id')).toHaveText(accessibleClaimId, {
        timeout: 15000,
      });
      await expect(page.getByTestId('ops-drawer')).toBeVisible();
      await expect(page.getByTestId('ops-drawer-content')).toBeVisible();
      await expect(page.getByTestId('action-message')).toBeVisible();

      const inaccessibleClaimId = 'e2e-not-accessible-claim-id';

      const inaccessiblePath = `${routes.agentWorkspaceClaims(
        testInfo
      )}?claimId=${encodeURIComponent(inaccessibleClaimId)}`;

      await gotoApp(page, inaccessiblePath, testInfo, { marker: 'agent-claims-pro-page' });

      await expect(page.getByTestId('workspace-claim-not-accessible').first()).toBeVisible();
      await expect(page.getByTestId('workspace-selected-claim-id')).toHaveCount(0);
    } finally {
      await cleanupFallbackClaim(accessibleClaimId, createdFallback);
    }
  });

  test('message persists after reload when opening claim by claimId', async ({
    agentPage: page,
  }, testInfo) => {
    const agentEmail = isMkProject(testInfo) ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;
    const { claimId: accessibleClaimId, createdFallback } =
      await resolveAccessibleClaimId(agentEmail);
    const uniqueText = `${MESSAGE_PERSISTENCE_PREFIX} ${Date.now()} ${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    try {
      // Keep this probe deterministic and bounded across repeated/CI runs.
      await cleanupPersistenceMessages(accessibleClaimId);

      const targetUrl = `${routes.agentWorkspaceClaims(testInfo)}?claimId=${encodeURIComponent(
        accessibleClaimId
      )}`;

      await gotoApp(page, targetUrl, testInfo, { marker: 'agent-claims-pro-page' });

      await expect(page.getByTestId('workspace-selected-claim-id')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('workspace-selected-claim-id')).toHaveText(accessibleClaimId, {
        timeout: 15000,
      });
      const actionMessage = page.getByTestId('action-message');
      await expect(actionMessage).toBeVisible();

      // Open messaging panel for deterministic claim context.
      await actionMessage.evaluate(el => (el as HTMLElement).click());
      const messagingPanel = page.locator('[data-testid="messaging-panel"]:visible');
      await expect(messagingPanel).toBeVisible({ timeout: 15000 });

      const messageInput = messagingPanel.getByTestId('message-input');
      await messageInput.fill(uniqueText);

      const sendButton = messagingPanel.getByTestId('send-message-button');
      await expect(sendButton).toBeEnabled();
      await sendButton.evaluate(el => (el as HTMLElement).click());

      const sentMessage = messagingPanel
        .locator('p.whitespace-pre-wrap')
        .filter({ hasText: uniqueText });
      await expect(sentMessage).toBeVisible({ timeout: 10000 });
      await waitForPersistedMessage(accessibleClaimId, uniqueText);

      await page.reload();

      await expect(page.getByTestId('workspace-selected-claim-id')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('workspace-selected-claim-id')).toHaveText(accessibleClaimId, {
        timeout: 15000,
      });

      const actionMessageAfterReload = page.getByTestId('action-message');
      await expect(actionMessageAfterReload).toBeVisible();
      await actionMessageAfterReload.evaluate(el => (el as HTMLElement).click());

      const refreshedMessagingPanel = page.locator('[data-testid="messaging-panel"]:visible');
      await expect(refreshedMessagingPanel).toBeVisible({ timeout: 15000 });
      await expect(
        refreshedMessagingPanel.locator('p.whitespace-pre-wrap').filter({ hasText: uniqueText })
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanupPersistenceMessages(accessibleClaimId, uniqueText);
      await cleanupFallbackClaim(accessibleClaimId, createdFallback);
    }
  });
});
