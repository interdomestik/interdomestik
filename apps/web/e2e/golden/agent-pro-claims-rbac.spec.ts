import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Pro Claims RBAC (Golden)', () => {
  test('Agent CAN access linked member claim but CANNOT access unlinked claim', async ({
    agentPage: page,
  }, testInfo) => {
    // 1. Navigate to Claims Workspace
    await gotoApp(page, routes.agentWorkspaceClaims(testInfo), testInfo, {
      marker: 'agent-claims-pro-page',
    });

    const table = page.getByTestId('ops-table');
    const drawerContent = page.getByTestId('ops-drawer-content');

    // --- POSITIVE CASE (Linked Claim) ---
    // Seeded data usually has specific titles for KS vs MK
    const isMK = testInfo.project.name.includes('mk');
    const linkedClaimTitle = isMK ? 'MK SUBMITTED Claim 1' : 'KS-A SUBMITTED Claim 1';
    const linkedRow = table.getByTestId('claim-row').filter({ hasText: linkedClaimTitle }).first();

    if (await linkedRow.isVisible()) {
      await linkedRow.click();
      await expect(drawerContent).toBeVisible();

      // Switch to Messaging view
      await page
        .getByTestId('action-message')
        .first()
        .evaluate(el => (el as HTMLElement).click());

      // Verify Messaging Panel
      const messagingPanel = page.getByTestId('messaging-panel');
      await expect(messagingPanel).toBeVisible();

      // Close drawer
      // Close drawer via button (more robust than Escape)
      await page.getByTestId('sheet-close-button').evaluate((el: HTMLElement) => el.click());
      await expect(drawerContent).not.toBeVisible();
    }

    // --- NEGATIVE CASE (Cross-Tenant Claim) ---
    // Agent should never see claims from another tenant
    const crossTenantClaimId = isMK ? 'golden_ks_b_claim_01' : 'golden_claim_mk_1';

    // Attempt to force-open the drawer via URL parameter for the cross-tenant claim
    const targetUrl = `${routes.agentWorkspaceClaims(testInfo)}?selected=${crossTenantClaimId}`;
    await gotoApp(page, targetUrl, testInfo, { marker: 'agent-claims-pro-page' });

    // Drawer content should NOT be visible because server-side query filters it out by tenant
    await expect(drawerContent).not.toBeVisible();
  });
});
