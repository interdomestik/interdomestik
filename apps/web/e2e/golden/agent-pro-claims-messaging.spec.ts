import { expect, test } from '../fixtures/auth.fixture';

test.describe('Agent Pro Claims Messaging (Golden)', () => {
  test('Agent can send a message on a claim', async ({ page, loginAs }, testInfo) => {
    // 1. Login as Agent (this navigates to /{locale}/agent)
    await loginAs('agent');

    // 2. Determine locale from project and navigate to Claims Pro Page
    const tenant = testInfo.project.name.includes('mk') ? 'mk' : 'ks';
    const locale = tenant === 'mk' ? 'mk' : 'sq';
    await page.goto(`/${locale}/agent/workspace/claims`);

    // 3. Wait for page to fully load (wait for the table)
    const table = page.getByTestId('ops-table');
    await expect(table).toBeVisible({ timeout: 20000 });

    // 4. Click on the first available claim row to open drawer
    const firstRow = table.getByTestId('claim-row').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();

    // 5. Verify Drawer is Open (using data-state for Radix components)
    const drawer = page.getByTestId('ops-drawer');
    await expect(drawer).toHaveAttribute('data-state', 'open', { timeout: 15000 });

    // 6. Click "Send Message" action using stable testid
    const messageAction = drawer.getByTestId('action-message');
    await expect(messageAction).toBeVisible({ timeout: 5000 });
    await messageAction.click();

    // 7. Verify Messaging Panel is visible
    const messagingPanel = page.getByTestId('messaging-panel');
    await expect(messagingPanel).toBeVisible({ timeout: 10000 });

    // 8. Verify internal note toggle is NOT visible for agent (RBAC check)
    await expect(messagingPanel.getByTestId('internal-note-toggle')).not.toBeVisible();

    // 9. Get the message input using stable testid
    const messageInput = messagingPanel.getByTestId('message-input');
    await expect(messageInput).toBeVisible();

    // 10. Send a custom message with unique timestamp
    const testMessage = `E2E Test Message ${Date.now()}`;
    await messageInput.fill(testMessage);
    await messagingPanel.getByTestId('send-message-button').click();

    // 11. Verify message appears (optimistic update - core functionality)
    const newBubble = messagingPanel.getByText(testMessage);
    await expect(newBubble).toBeVisible({ timeout: 5000 });

    // Test complete: Message sending verified
    // Note: Persistence is tested via API/integration tests, not E2E
  });
});
