import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Pro Claims RBAC', () => {
  test('Agent CAN access linked member claim but CANNOT access unlinked claim', async ({
    agentPage,
  }) => {
    // 1. Navigate to Claims Workspace
    await agentPage.goto('/en/agent/workspace/claims');

    // --- POSITIVE CASE (Linked Claim) ---
    // Agent A IS linked to Member A (ks_a_member_1), so they should see 'KS-A ... Claim 1'.
    const linkedClaimTitle = 'KS-A SUBMITTED Claim 1';
    await expect(agentPage.getByText(linkedClaimTitle)).toBeVisible();

    // Open the linked claim drawer
    await agentPage.getByText(linkedClaimTitle).click();

    // Verify Drawer and Messaging Panel Open
    const drawerContent = agentPage.getByTestId('ops-drawer-content');
    await expect(drawerContent).toBeVisible();

    // Switch to Messaging view (if in Details view) - Logic depends on Page.
    // The Page component defaults to 'details'. We need to click "Message" action or "Switch".
    // Wait, the Page UI has Actions in the footer for 'details' view.
    // We need to find the "Message" action button.
    // In `AgentClaimsProPage.tsx`:
    // const actions = ... secondary: [{ id: 'message', ... }]
    // OpsActionBar renders these. Let's find button with text 'Message' or icon.
    // Usually "Message Member" or just "Message".
    // Let's inspect the OpsActionBar usage or try seeded text.
    // Assuming standard "Message" label from adapter.

    // Actually, looking at `AgentClaimsProPage.tsx`, the action ID is 'message'.
    // The label comes from translation, likely "Message".
    // Let's try to click the button.
    await agentPage.getByRole('button', { name: 'Message' }).click();

    // Verify Messaging Panel
    const messagingPanel = agentPage.getByTestId('messaging-panel');
    await expect(messagingPanel).toBeVisible();

    // Send a test message
    const testMessage = `Test Message ${Math.random().toString(36).substring(7)}`;
    await agentPage.getByPlaceholder('Type your message...').fill(testMessage);
    await agentPage.getByTestId('send-message-button').click();

    // Verify message appears in list
    await expect(agentPage.getByText(testMessage)).toBeVisible();

    // Close drawer to reset state for negative test
    await agentPage.getByTestId('close-ops-drawer-button').click();
    await expect(drawerContent).not.toBeVisible();

    // --- NEGATIVE CASE (Unlinked Claim) ---
    // "KS-B Claim 1" belongs to a different agent (ks_b_agent_1) and member (ks_b_member_1).
    // Agent A (current user) should NOT see it in the list.
    await expect(agentPage.getByText('KS-B Claim 1')).not.toBeVisible();

    // Verify Direct Access Protection
    // Attempt to force-open the drawer via URL parameter for the unlinked claim.
    const unlinkedClaimId = 'golden_ks_b_claim_01';
    await agentPage.goto(`/en/agent/workspace/claims?selected=${unlinkedClaimId}`);

    // Since the server-side query filters out unlinked claims, the "selectedClaim"
    // in the component will be undefined, and the drawer should NOT open.
    // Note: The page might load, but the drawer conditional `open={!!selectedClaim}` will be false.
    await expect(agentPage.getByTestId('ops-drawer-content')).not.toBeVisible();
  });
});
