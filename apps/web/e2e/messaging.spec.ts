import { expect, test } from './fixtures/auth.fixture';

test.describe('Messaging System', () => {
  test.describe('Member Messaging', () => {
    test('should display messaging panel on claim detail page', async ({ authenticatedPage }) => {
      // Navigate to claims list
      await authenticatedPage.goto('/member/claims');

      // Wait for claims to load
      await authenticatedPage.waitForSelector('text=Flight Delay', { timeout: 10000 });

      // Get the link href and navigate directly to avoid click interception issues
      const link = authenticatedPage
        .locator('tr', { hasText: 'Flight Delay to Munich' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      expect(href).toBeTruthy();

      await authenticatedPage.goto(href!);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Verify messaging panel is visible using data-testid
      const messagingPanel = authenticatedPage.locator('[data-testid="messaging-panel"]:visible');
      await expect(messagingPanel).toBeVisible({ timeout: 10000 });
    });

    test('should show messages section', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/member/claims');
      await authenticatedPage.waitForSelector('text=Car Accident');

      const link = authenticatedPage
        .locator('tr', { hasText: 'Car Accident - Rear Ended' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      await authenticatedPage.goto(href!);

      // Look for messaging panel
      const messagingPanel = authenticatedPage.locator('[data-testid="messaging-panel"]:visible');
      await expect(messagingPanel).toBeVisible({ timeout: 10000 });
    });

    test('should have message input field', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/member/claims');
      await authenticatedPage.waitForSelector('text=Flight Delay');

      const link = authenticatedPage
        .locator('tr', { hasText: 'Flight Delay to Munich' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      await authenticatedPage.goto(href!);

      // Find message input using data-testid
      const messageInput = authenticatedPage.locator('[data-testid="message-input"]:visible');
      await expect(messageInput).toBeVisible({ timeout: 10000 });
    });

    test('should have send button', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/member/claims');
      await authenticatedPage.waitForSelector('text=Flight Delay');

      const link = authenticatedPage
        .locator('tr', { hasText: 'Flight Delay to Munich' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      await authenticatedPage.goto(href!);

      // Find send button using data-testid
      const sendButton = authenticatedPage.locator('[data-testid="send-message-button"]:visible');
      await expect(sendButton).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Staff Messaging', () => {
    test('should display messaging panel on staff claim detail page', async ({ staffPage }) => {
      // Navigate to staff claims
      await staffPage.goto('/en/staff/claims');

      // Wait for claims list
      await staffPage.waitForSelector('table, [class*="claim"]', { timeout: 10000 });

      // Click first claim and wait for navigation
      const firstClaimLink = staffPage.locator('a[href*="/staff/claims/"]').first();
      // Force click to avoid sticky header interception on mobile
      await firstClaimLink.click({ force: true });
      await staffPage.waitForLoadState('domcontentloaded');

      // Wait for detail page (increased timeout for WebKit)
      await staffPage.waitForURL(/\/staff\/claims\//, { timeout: 45000 });

      // Verify messaging panel is present using data-testid
      const messagingPanel = staffPage.locator('[data-testid="messaging-panel"]:visible');
      await expect(messagingPanel).toBeVisible({ timeout: 10000 });
    });

    test('should have internal note checkbox for staff', async ({ staffPage }) => {
      await staffPage.goto('/en/staff/claims');
      await staffPage.waitForSelector('table, [class*="claim"]', { timeout: 10000 });

      const firstClaimLink = staffPage.locator('a[href*="/staff/claims/"]').first();

      // Force click to avoid sticky header interception on mobile
      await firstClaimLink.click({ force: true });
      await staffPage.waitForURL(/\/staff\/claims\//, { timeout: 45000 });

      // Look for internal note toggle using data-testid
      const internalNoteToggle = staffPage.locator('[data-testid="internal-note-toggle"]:visible');
      await expect(internalNoteToggle).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Message Sending (Integration)', () => {
    test.skip('should send a message and see it appear', async ({ authenticatedPage }) => {
      // This test is skipped by default as it requires database writes
      // Enable when running against a test database
      await authenticatedPage.goto('/member/claims');
      await authenticatedPage.waitForSelector('text=Flight Delay');
      await authenticatedPage.click('text=Flight Delay to Munich');
      await authenticatedPage.waitForURL(/\/member\/claims\/claim-/);

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
