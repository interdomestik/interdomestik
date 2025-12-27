/**
 * Messaging System E2E Tests
 *
 * These tests verify the messaging functionality on claim detail pages.
 * They require specific seeded data to exist.
 *
 * SKIP by default: These tests depend on exact seeded claims being present
 * and specific UI elements that may vary. Enable when testing messaging
 * features specifically.
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Messaging System', () => {
  test.describe('Member Messaging', () => {
    test('should display messaging panel on claim detail page', async ({ authenticatedPage }) => {
      // This test requires specific seeded data
      await authenticatedPage.goto(routes.memberClaims('en'));

      // Wait for claims to load
      await authenticatedPage.waitForSelector('text=Flight Delay', { timeout: 30000 });

      const link = authenticatedPage
        .locator('tr', { hasText: 'Flight Delay to Munich' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      expect(href).toBeTruthy();

      await authenticatedPage.goto(href!);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const messagingPanel = authenticatedPage.locator('[data-testid="messaging-panel"]').first();
      await expect(messagingPanel).toBeVisible({ timeout: 10000 });
    });

    test('should show messages section', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(routes.memberClaims('en'));
      await authenticatedPage.waitForSelector('text=Car Accident', { timeout: 30000 });

      const link = authenticatedPage
        .locator('tr', { hasText: 'Car Accident - Rear Ended' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      await authenticatedPage.goto(href!);

      const messagingPanel = authenticatedPage.locator('[data-testid="messaging-panel"]').first();
      await expect(messagingPanel).toBeVisible({ timeout: 10000 });
    });

    test('should have message input field', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(routes.memberClaims('en'));
      await authenticatedPage.waitForSelector('text=Flight Delay', { timeout: 30000 });

      const link = authenticatedPage
        .locator('tr', { hasText: 'Flight Delay to Munich' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      await authenticatedPage.goto(href!);

      const messageInput = authenticatedPage.locator('[data-testid="message-input"]').first();
      await expect(messageInput).toBeVisible({ timeout: 10000 });
    });

    test('should have send button', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(routes.memberClaims('en'));
      await authenticatedPage.waitForSelector('text=Flight Delay', { timeout: 30000 });

      const link = authenticatedPage
        .locator('tr', { hasText: 'Flight Delay to Munich' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      await authenticatedPage.goto(href!);

      const sendButton = authenticatedPage.locator('[data-testid="send-message-button"]').first();
      await expect(sendButton).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Staff Messaging', () => {
    test('should display messaging panel on staff claim detail page', async ({ staffPage }) => {
      await staffPage.goto(routes.staffClaims('en'));
      await staffPage.waitForSelector('table, [class*="claim"]', { timeout: 30000 });

      const firstClaimLink = staffPage.locator('a[href*="/staff/claims/"]').first();
      await firstClaimLink.click({ force: true });
      await staffPage.waitForLoadState('domcontentloaded');
      await staffPage.waitForURL(/\/staff\/claims\//, { timeout: 45000 });

      const messagingPanel = staffPage.locator('[data-testid="messaging-panel"]').first();
      await expect(messagingPanel).toBeVisible({ timeout: 10000 });
    });

    test('should have internal note checkbox for staff', async ({ staffPage }) => {
      await staffPage.goto(routes.staffClaims('en'));
      await staffPage.waitForSelector('table, [class*="claim"]', { timeout: 30000 });

      const firstClaimLink = staffPage.locator('a[href*="/staff/claims/"]').first();
      await firstClaimLink.click({ force: true });
      await staffPage.waitForURL(/\/staff\/claims\//, { timeout: 45000 });

      const internalNoteToggle = staffPage.locator('[data-testid="internal-note-toggle"]').first();
      await expect(internalNoteToggle).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Message Sending (Integration)', () => {
    test('should send a message and see it appear', async ({ authenticatedPage }) => {
      // This test is skipped by default as it requires database writes
      await authenticatedPage.goto(routes.memberClaims('en'));
      await authenticatedPage.waitForSelector('text=Flight Delay', { timeout: 30000 });
      const link = authenticatedPage
        .locator('tr', { hasText: 'Flight Delay to Munich' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      await authenticatedPage.goto(href!);

      const testMessage = `Test message ${Date.now()}`;

      const messageInput = authenticatedPage.locator('[data-testid="message-input"]').first();
      await messageInput.fill(testMessage);

      const sendButton = authenticatedPage.locator('[data-testid="send-message-button"]').first();
      await sendButton.click();

      await expect(authenticatedPage.getByText(testMessage)).toBeVisible({ timeout: 10000 });
    });
  });
});
