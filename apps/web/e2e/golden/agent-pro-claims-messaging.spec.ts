import { expect, test } from '../fixtures/auth.fixture';

const DETERMINISTIC_IDS = {
  'ks-sq': {
    claimId: 'golden_ks_track_claim_001',
    urlParam: '?selected=golden_ks_track_claim_001',
  },
  'mk-mk': {
    claimId: 'golden_mk_track_claim_001',
    urlParam: '?selected=golden_mk_track_claim_001',
  },
  smoke: {
    claimId: 'golden_ks_track_claim_001',
    urlParam: '?selected=golden_ks_track_claim_001',
  },
};

test.describe('Agent Pro Claims Messaging (Golden)', () => {
  test('Agent can send a message on a claim', async ({ page, loginAs }, testInfo) => {
    // 0. Determine Seed Config based on Project
    const projectName = testInfo.project.name || 'ks-sq';
    const config =
      DETERMINISTIC_IDS[projectName as keyof typeof DETERMINISTIC_IDS] ||
      DETERMINISTIC_IDS['ks-sq'];

    // 1. Login as Agent
    await loginAs('agent');

    // 2. Navigate Directly to Claims Page with Selected Claim
    // This removes reliance on list rendering/order and ensures we target a specific known claim.
    await page.goto(`/agent/workspace/claims${config.urlParam}`);

    // 3. Verify Drawer is Open (Deterministic)
    const drawer = page.getByTestId('ops-drawer');
    await expect(drawer).toBeVisible({ timeout: 15000 });

    // 4. Click "Send Message" action
    // Use stable ID from OpsActionBar
    await drawer.getByTestId('action-message').click();

    // 5. Verify Messaging Panel
    const messagingPanel = page.getByTestId('messaging-panel');
    await expect(messagingPanel).toBeVisible();

    // 6. Send a message
    const messageInput = messagingPanel.getByRole('textbox', { name: 'Type your message...' });

    // Verify internal note toggle is NOT visible for agent
    await expect(messagingPanel.getByTestId('internal-note-toggle')).not.toBeVisible();

    // Verify Quick Replies
    const quickReplyGreeting = messagingPanel.getByTestId('quick-reply-greeting');
    await expect(quickReplyGreeting).toBeVisible();
    await quickReplyGreeting.click();
    await expect(messageInput).toHaveValue('Hello, how can I help you?');
    await messageInput.clear();

    await messageInput.fill('Hello from Agent E2E');
    await messagingPanel.getByTestId('send-message-button').click();

    // 7. Verify Optimistic Pending State
    const newBubble = messagingPanel.getByText('Hello from Agent E2E');
    await expect(newBubble).toBeVisible();

    // 8. Verify Unread Badge Logic / Closing Drawer
    // Use OpsDrawer X button (Stable Selector by Role + Exact)
    // This is the most reliable way without modifying the shared UI package.
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(drawer).not.toBeVisible();

    // 9. Re-open to verify persistence
    // We can just reload the URL or click the row if visible.
    // Since we are deterministic, let's just reload to prove backend persistence.
    await page.reload();
    await expect(drawer).toBeVisible(); // Should handle 'selected' param persistence if URL state is kept?
    // Actually, on reload, URL param ?selected=... stays, so drawer opens.

    await drawer.getByTestId('action-message').click();
    await expect(messagingPanel.getByText('Hello from Agent E2E')).toBeVisible();
  });
});
