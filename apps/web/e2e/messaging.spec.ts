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

      // Verify messaging panel is visible using data-testid
      const messagingPanel = authenticatedPage.locator('[data-testid="messaging-panel"]');
      await expect(messagingPanel.first()).toBeVisible({ timeout: 10000 });
    });

    test('should show messages section', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/dashboard/claims');
      await authenticatedPage.waitForSelector('text=Car Accident');
      await authenticatedPage.click('text=Car Accident - Rear Ended');
      await authenticatedPage.waitForURL(/\/dashboard\/claims\/claim-/);

      // Look for messaging panel
      const messagingPanel = authenticatedPage.locator('[data-testid="messaging-panel"]');
      await expect(messagingPanel.first()).toBeVisible({ timeout: 10000 });
    });

    test('should have message input field', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/dashboard/claims');
      await authenticatedPage.waitForSelector('text=Flight Delay');
      await authenticatedPage.click('text=Flight Delay to Munich');
      await authenticatedPage.waitForURL(/\/dashboard\/claims\/claim-/);

      // Find message input using data-testid
      const messageInput = authenticatedPage.locator('[data-testid="message-input"]');
      await expect(messageInput.first()).toBeVisible({ timeout: 10000 });
    });

    test('should have send button', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/dashboard/claims');
      await authenticatedPage.waitForSelector('text=Flight Delay');
      await authenticatedPage.click('text=Flight Delay to Munich');
      await authenticatedPage.waitForURL(/\/dashboard\/claims\/claim-/);

      // Find send button using data-testid
      const sendButton = authenticatedPage.locator('[data-testid="send-message-button"]');
      await expect(sendButton.first()).toBeVisible({ timeout: 10000 });
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

      // Verify messaging panel is present using data-testid
      const messagingPanel = agentPage.locator('[data-testid="messaging-panel"]');
      await expect(messagingPanel.first()).toBeVisible({ timeout: 10000 });
    });

    test('should have internal note checkbox for agents', async ({ agentPage }) => {
      await agentPage.goto('/agent/claims');
      await agentPage.waitForSelector('table, [class*="claim"]', { timeout: 10000 });

      const firstClaimLink = agentPage.locator('a[href*="/agent/claims/"]').first();
      await firstClaimLink.click();
      await agentPage.waitForURL(/\/agent\/claims\//);

      // Look for internal note toggle using data-testid
      const internalNoteToggle = agentPage.locator('[data-testid="internal-note-toggle"]');
      await expect(internalNoteToggle.first()).toBeVisible({ timeout: 10000 });
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
      const messageInput = authenticatedPage.locator('[data-testid="message-input"]');
      await messageInput.first().fill(testMessage);

      // Send message
      const sendButton = authenticatedPage.locator('[data-testid="send-message-button"]');
      await sendButton.click();

      // Wait for message to appear in thread
      await expect(authenticatedPage.getByText(testMessage)).toBeVisible({ timeout: 10000 });
    });
  });
});
