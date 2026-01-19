import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Pro Claims Messaging (Golden)', () => {
  test('Agent can send a message on a claim', async ({ page, loginAs }) => {
    // 1. Login as Agent
    await loginAs('agent');

    // 2. Navigate to Claims Queue
    await page.goto('/en/agent/workspace/claims');

    // 3. Open first claim Drawer
    await expect(page.getByRole('columnheader', { name: 'Claim' })).toBeVisible();
    const firstRow = page.getByTestId('claim-row').first();
    await firstRow.click();

    const drawer = page.getByTestId('ops-drawer');
    await expect(drawer).toBeVisible();

    // 4. Click "Send Message" action
    // Note: This action doesn't exist yet, test will fail here first (Red)
    await drawer.getByRole('button', { name: 'Send Message' }).click();

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

    // 7. Verify message appears
    await expect(messagingPanel.getByText('Hello from Agent E2E')).toBeVisible();

    // 8. Close Drawer to cleanup
    // Optional, but good practice
    // await drawer.getByRole('button', { name: 'Close' }).click();
  });
});
