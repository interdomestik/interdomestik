import { OPS_TEST_IDS } from '../../src/components/ops/testids';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Pro Claims Messaging (Golden)', () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test('Agent can send a message on a claim', async ({ agentPage: page }, testInfo) => {
    // 1. Navigate directly to Claims Pro Page
    await expect(async () => {
      await gotoApp(page, routes.agentWorkspaceClaims(testInfo), testInfo, {
        marker: 'agent-claims-pro-page',
      });
    }).toPass({ timeout: 10000 });

    // 2. Click on the first available claim row to open drawer
    const firstRow = page.getByTestId('claim-row').first();

    if (!(await firstRow.isVisible())) {
      test.skip(true, 'No claims available to test messaging');
      return;
    }

    await firstRow.click();

    // 3. Verify Drawer is Open
    const drawer = page.getByTestId(OPS_TEST_IDS.DRAWER);
    await expect(drawer).toBeVisible({ timeout: 15000 });
    await expect(drawer).toHaveAttribute('data-state', 'open');

    // 4. Click "Send Message" action and wait for panel
    // Use evaluate click as a stabilizer for animation-heavy drawer footer
    await expect(async () => {
      const messageAction = page.getByTestId('action-message').first();
      await messageAction.evaluate(el => (el as HTMLElement).click());
      await expect(page.getByTestId('messaging-panel')).toBeVisible();
    }).toPass({ timeout: 15000 });

    // 5. Send message
    const messagingPanel = page.getByTestId('messaging-panel');
    const messageInput = messagingPanel.getByTestId('message-input');
    const testMessage = `E2E Agent Message ${Date.now()}`;
    await messageInput.fill(testMessage);

    const sendBtn = messagingPanel.getByTestId('send-message-button');
    await expect(sendBtn).toBeEnabled();
    await sendBtn.evaluate(el => (el as HTMLElement).click());

    // 6. Verify message appears
    await expect(messagingPanel.getByText(testMessage)).toBeVisible({ timeout: 10000 });
  });
});
