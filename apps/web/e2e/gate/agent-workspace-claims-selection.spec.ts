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

    await gotoApp(page, routes.agentWorkspaceClaims(testInfo), testInfo, {
      marker: 'agent-claims-pro-page',
    });

    const firstClaimRow = page.getByTestId('claim-row').first();
    await expect(firstClaimRow).toBeVisible();
    await firstClaimRow.click();

    await expect(page.getByTestId('ops-drawer')).toBeVisible();
    await expect(page.getByTestId('ops-drawer-content')).toBeVisible();
    await expect(page.getByTestId('ops-action-bar')).toBeVisible();

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
});
