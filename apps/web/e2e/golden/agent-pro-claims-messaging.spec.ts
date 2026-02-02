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

    // 2. Click on the target claim row (preferring known seeded claim) to open drawer
    const isMK = testInfo.project.name.includes('mk');
    const targetTitle = isMK ? 'MK SUBMITTED Claim 1' : 'KS-A SUBMITTED Claim 1';
    const specificRow = page.getByTestId('claim-row').filter({ hasText: targetTitle }).first();
    const firstRow = page.getByTestId('claim-row').first();

    const rowToClick = (await specificRow.isVisible()) ? specificRow : firstRow;

    if (!(await rowToClick.isVisible())) {
      test.skip(true, 'No claims available to test messaging');
      return;
    }

    await rowToClick.click();

    // 3. Verify Drawer is Open
    const drawer = page.getByTestId(OPS_TEST_IDS.DRAWER);
    await expect(drawer).toBeVisible({ timeout: 15000 });
    await expect(drawer).toHaveAttribute('data-state', 'open');

    // 4. Click "Send Message" action and wait for panel
    // Use evaluate click as a stabilizer for animation-heavy drawer footer
    const messageAction = page.getByTestId('action-message').first();
    await messageAction.evaluate(el => (el as HTMLElement).click());
    await expect(page.getByTestId('messaging-panel')).toBeVisible({ timeout: 15000 });

    // 5. Send message
    // Strict mode fix: Scope to the visible panel to prevent ambiguity if multiple panels exist (e.g. in DOM but hidden)
    const messagingPanel = page.locator('[data-testid="messaging-panel"]:visible');
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
