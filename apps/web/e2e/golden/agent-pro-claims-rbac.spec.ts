import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Pro Claims RBAC', () => {
  test('Agent CANNOT access or message unlinked member claim', async ({ agentPage }) => {
    // 1. Navigate to Claims Workspace
    // Note: agentPage fixture logs in as Agent A (agent.ks.a1) who is linked to KS-A members only.
    await agentPage.goto('/en/agent/workspace/claims');

    // 2. Verify List Isolation
    // "KS-B Claim 1" belongs to a different agent (ks_b_agent_1) and member (ks_b_member_1).
    // Agent A (current user) should NOT see it in the list.
    // We check for the specific seeded title.
    await expect(agentPage.getByText('KS-B Claim 1')).not.toBeVisible();

    // 3. Verify Direct Access Protection
    // Attempt to force-open the drawer via URL parameter for the unlinked claim.
    // ID 'golden_ks_b_claim_01' is deterministic from seed-golden.ts.
    const unlinkedClaimId = 'golden_ks_b_claim_01';
    await agentPage.goto(`/en/agent/workspace/claims?selected=${unlinkedClaimId}`);

    // Since the server-side query filters out unlinked claims, the "selectedClaim"
    // in the component will be undefined, and the drawer should NOT open.
    const drawerContent = agentPage.getByTestId('ops-drawer-content');
    await expect(drawerContent).not.toBeVisible();

    // 4. Verify Messaging Panel Unreachability
    // If drawer is closed, messaging panel is not rendered, ensuring NO message can be sent UI-side.
    const messagingPanel = agentPage.getByTestId('messaging-panel');
    await expect(messagingPanel).not.toBeVisible();
  });
});
