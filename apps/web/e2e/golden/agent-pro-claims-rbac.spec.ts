import { expect, test } from '../fixtures/auth.fixture';

/**
 * Agent Pro Claims RBAC Test
 *
 * @ticket INTERDO-Q003: Re-enable after seed:e2e includes RBAC test claims
 * @expiry 2026-02-15
 */
test.describe('Agent Pro Claims RBAC', () => {
  test('Agent CAN access linked member claim but CANNOT access unlinked claim', async ({
    agentPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('mk'),
      'Test designed for KS dataset (Agent A vs Agent B)'
    );

    // 1. Navigate to Claims Workspace
    await agentPage.goto('/en/agent/workspace/claims');
    await agentPage.waitForLoadState('domcontentloaded');

    const table = agentPage.getByTestId('ops-table');
    const drawer = agentPage.getByTestId('ops-drawer-content');

    // --- POSITIVE CASE (Linked Claim) ---
    // Agent A IS linked to Member A (ks_a_member_1), so they should see 'KS-A ... Claim 1'.
    const linkedClaimTitle = 'KS-A SUBMITTED Claim 1';
    const linkedRow = table.getByTestId('claim-row').filter({ hasText: linkedClaimTitle });

    await expect(linkedRow).toBeVisible();

    // Open the linked claim drawer
    await linkedRow.click();
    await expect(drawer).toBeVisible();

    // Switch to Messaging view using stable test ID
    await agentPage.getByTestId('action-message').click();

    // Verify Messaging Panel
    const messagingPanel = agentPage.getByTestId('messaging-panel');
    await expect(messagingPanel).toBeVisible();

    // Send a test message
    const testMessage = `Test Message ${Math.random().toString(36).substring(7)}`;
    const input = messagingPanel.getByTestId('message-input');
    await input.fill(testMessage);
    await messagingPanel.getByTestId('send-message-button').click();

    // Verify message appears in list (scoped to panel)
    await expect(messagingPanel.getByText(testMessage)).toBeVisible();

    // Reset state for negative test
    await agentPage.goto('/en/agent/workspace/claims');
    await expect(drawer).not.toBeVisible();

    // --- NEGATIVE CASE (Unlinked Claim) ---
    const unlinkedClaimTitle = 'KS-B Claim 1';
    await expect(table.getByText(unlinkedClaimTitle)).not.toBeVisible();

    // Verify Direct Access Protection
    const unlinkedClaimId = 'golden_ks_b_claim_01';
    await agentPage.goto(`/en/agent/workspace/claims?selected=${unlinkedClaimId}`);

    // Drawer should NOT open for unlinked claim
    await expect(drawer).not.toBeVisible();
  });
});
