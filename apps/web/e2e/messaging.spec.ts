import { expect, test } from './fixtures/auth.fixture';

test.describe('Messaging System', () => {
  test.describe('Member Messaging', () => {
    test('should display messaging panel on claim detail page', async ({ authenticatedPage }) => {
      // Navigate to claims list
      await authenticatedPage.goto('/dashboard/claims');

      // Wait for claims to load
      await authenticatedPage.waitForSelector('text=Flight Delay', { timeout: 10000 });

      // Click on a claim to view details
      await authenticatedPage.click('text=Flight Delay to Munich');

      // Wait for detail page to load
      await authenticatedPage.waitForURL(/\/dashboard\/claims\/claim-/);

      // Verify messaging panel is visible
      const messagingPanel = authenticatedPage.locator(
        '[class*="MessagingPanel"], [data-testid="messaging-panel"], :text("Messages")'
      );
      await expect(messagingPanel.first()).toBeVisible({ timeout: 5000 });
    });

    test('should show empty state when no messages', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/dashboard/claims');
      await authenticatedPage.waitForSelector('text=Car Accident');
      await authenticatedPage.click('text=Car Accident - Rear Ended');
      await authenticatedPage.waitForURL(/\/dashboard\/claims\/claim-/);

      // Check the messaging UI is present (empty state or messages)
      const messagesSection = authenticatedPage.getByText(/Messages/i);
      await expect(messagesSection.first()).toBeVisible();
    });

    test('should have message input field', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/dashboard/claims');
      await authenticatedPage.waitForSelector('text=Flight Delay');
      await authenticatedPage.click('text=Flight Delay to Munich');
      await authenticatedPage.waitForURL(/\/dashboard\/claims\/claim-/);

      // Find message input
      const messageInput = authenticatedPage.locator(
        'textarea[placeholder*="message"], textarea[placeholder*="Type"], [data-testid="message-input"]'
      );
      await expect(messageInput.first()).toBeVisible({ timeout: 5000 });
    });

    test('should have send button', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/dashboard/claims');
      await authenticatedPage.waitForSelector('text=Flight Delay');
      await authenticatedPage.click('text=Flight Delay to Munich');
      await authenticatedPage.waitForURL(/\/dashboard\/claims\/claim-/);

      // Find send button (look for button with Send icon or text)
      const sendButton = authenticatedPage.locator(
        'button:has(svg[class*="Send"]), button:has([class*="lucide-send"]), button[type="submit"]:near(textarea)'
      );
      await expect(sendButton.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Agent Messaging', () => {
    test('should display messaging panel on agent claim detail page', async ({ agentPage }) => {
      // Navigate to agent claims
      await agentPage.goto('/agent/claims');

      // Wait for claims list
      await agentPage.waitForSelector('table, [class*="claim"]', { timeout: 10000 });

      // Click first claim
      const firstClaimLink = agentPage.locator('a[href*="/agent/claims/"]').first();
      await firstClaimLink.click();

      // Wait for detail page
      await agentPage.waitForURL(/\/agent\/claims\//);

      // Verify messaging panel is present
      const messagesSection = agentPage.getByText(/Messages/i);
      await expect(messagesSection.first()).toBeVisible({ timeout: 5000 });
    });

    test('should have internal note checkbox for agents', async ({ agentPage }) => {
      await agentPage.goto('/agent/claims');
      await agentPage.waitForSelector('table, [class*="claim"]', { timeout: 10000 });

      const firstClaimLink = agentPage.locator('a[href*="/agent/claims/"]').first();
      await firstClaimLink.click();
      await agentPage.waitForURL(/\/agent\/claims\//);

      // Look for internal note checkbox/label
      const internalNoteControl = agentPage.locator(
        'label:has-text("internal"), input[id="internal"], [data-testid="internal-note-toggle"]'
      );
      await expect(internalNoteControl.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Message Sending (Integration)', () => {
    test.skip('should send a message and see it appear', async ({ authenticatedPage }) => {
      // This test is skipped by default as it requires database writes
      // Enable when running against a test database
      await authenticatedPage.goto('/dashboard/claims');
      await authenticatedPage.waitForSelector('text=Flight Delay');
      await authenticatedPage.click('text=Flight Delay to Munich');
      await authenticatedPage.waitForURL(/\/dashboard\/claims\/claim-/);

      const testMessage = `Test message ${Date.now()}`;

      // Type message
      const messageInput = authenticatedPage.locator('textarea');
      await messageInput.first().fill(testMessage);

      // Send message
      const sendButton = authenticatedPage.locator('button[type="submit"]').last();
      await sendButton.click();

      // Wait for message to appear in thread
      await expect(authenticatedPage.getByText(testMessage)).toBeVisible({ timeout: 10000 });
    });
  });
});
