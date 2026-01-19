import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Pro Claims RBAC', () => {
  test('Agent CAN access linked member claim but CANNOT access unlinked claim', async ({
    agentPage,
  }) => {
    // 1. Navigate to Claims Workspace
    // Uses API-based login for Agent A via fixture
    await agentPage.goto('/en/agent/workspace/claims');
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

    // Close drawer to reset state for negative test
    // OpsDrawer usually relies on Sheet primitive, Escape is robust standard
    await agentPage.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();

    // --- NEGATIVE CASE (Unlinked Claim) ---
    // "KS-B Claim 1" belongs to a different agent (ks_b_agent_1) and member (ks_b_member_1).
    // Agent A (current user) should NOT see it in the list.
    const unlinkedClaimTitle = 'KS-B Claim 1';
    await expect(table.getByText(unlinkedClaimTitle)).not.toBeVisible();

    // Verify Direct Access Protection
    // Attempt to force-open the drawer via URL parameter for the unlinked claim.
    // ID 'golden_ks_b_claim_01' is deterministic from seed-golden.ts
    const unlinkedClaimId = 'golden_ks_b_claim_01';
    await agentPage.goto(`/en/agent/workspace/claims?selected=${unlinkedClaimId}`);

    // Since the server-side query filters out unlinked claims, the "selectedClaim"
    // in the component will be undefined, and the drawer should NOT open.
    // We assert that the drawer content is explicitly NOT attached/visible.
    await expect(drawer).not.toBeVisible();
  });
});
