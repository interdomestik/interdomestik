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
import { gotoApp } from './utils/navigation';

const runSeededDataTests = process.env.RUN_SEEDED_DATA_TESTS === '1';

test.describe('Messaging System', () => {
  test.skip(!runSeededDataTests, 'Requires seeded data. Set RUN_SEEDED_DATA_TESTS=1 to enable.');
  test.describe('Member Messaging', () => {
    test('should display messaging panel on claim detail page', async ({
      authenticatedPage,
    }, testInfo) => {
      // This test requires specific seeded data
      await gotoApp(authenticatedPage, routes.memberClaims('en'), testInfo);

      // Wait for claims to load
      await authenticatedPage.waitForSelector('text=Flight Delay', { timeout: 30000 });

      const link = authenticatedPage
        .locator('tr', { hasText: 'Flight Delay to Munich' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      expect(href).toBeTruthy();

      await gotoApp(authenticatedPage, href!, testInfo);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const messagingPanel = authenticatedPage.locator('[data-testid="messaging-panel"]:visible');
      await expect(messagingPanel).toBeVisible({ timeout: 10000 });
    });

    test('should show messages section', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberClaims('en'), testInfo);
      await authenticatedPage.waitForSelector('text=Car Accident', { timeout: 30000 });

      const link = authenticatedPage
        .locator('tr', { hasText: 'Car Accident - Rear Ended' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      await gotoApp(authenticatedPage, href!, testInfo);

      const messagingPanel = authenticatedPage.locator('[data-testid="messaging-panel"]:visible');
      await expect(messagingPanel).toBeVisible({ timeout: 10000 });
    });

    test('should have message input field', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberClaims('en'), testInfo);
      await authenticatedPage.waitForSelector('text=Flight Delay', { timeout: 30000 });

      const link = authenticatedPage
        .locator('tr', { hasText: 'Flight Delay to Munich' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      await gotoApp(authenticatedPage, href!, testInfo);

      const messageInput = authenticatedPage.locator('[data-testid="message-input"]:visible');
      await expect(messageInput).toBeVisible({ timeout: 10000 });
    });

    test('should have send button', async ({ authenticatedPage }, testInfo) => {
      await gotoApp(authenticatedPage, routes.memberClaims('en'), testInfo);
      await authenticatedPage.waitForSelector('text=Flight Delay', { timeout: 30000 });

      const link = authenticatedPage
        .locator('tr', { hasText: 'Flight Delay to Munich' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      await gotoApp(authenticatedPage, href!, testInfo);

      const sendButton = authenticatedPage.locator('[data-testid="send-message-button"]:visible');
      await expect(sendButton).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Staff Messaging', () => {
    test('should display messaging panel on staff claim detail page', async ({
      staffPage,
    }, testInfo) => {
      await gotoApp(staffPage, routes.staffClaims('en'), testInfo);
      await staffPage.waitForSelector('table, [class*="claim"]', { timeout: 30000 });

      const firstClaimLink = staffPage.locator('a[href*="/staff/claims/"]').first();
      await firstClaimLink.click({ force: true });
      await staffPage.waitForLoadState('domcontentloaded');
      await staffPage.waitForURL(/\/staff\/claims\//, { timeout: 45000 });

      const messagingPanel = staffPage.locator('[data-testid="messaging-panel"]:visible');
      await expect(messagingPanel).toBeVisible({ timeout: 10000 });
    });

    test('should have internal note checkbox for staff', async ({ staffPage }, testInfo) => {
      await gotoApp(staffPage, routes.staffClaims('en'), testInfo);
      await staffPage.waitForSelector('table, [class*="claim"]', { timeout: 30000 });

      const firstClaimLink = staffPage.locator('a[href*="/staff/claims/"]').first();
      await firstClaimLink.click({ force: true });
      await staffPage.waitForURL(/\/staff\/claims\//, { timeout: 45000 });

      const internalNoteToggle = staffPage.locator('[data-testid="internal-note-toggle"]:visible');
      await expect(internalNoteToggle).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Message Sending (Integration)', () => {
    test('should send a message and see it appear', async ({ authenticatedPage }, testInfo) => {
      // This test is skipped by default as it requires database writes
      await gotoApp(authenticatedPage, routes.memberClaims('en'), testInfo);
      await authenticatedPage.waitForSelector('text=Flight Delay', { timeout: 30000 });
      const link = authenticatedPage
        .locator('tr', { hasText: 'Flight Delay to Munich' })
        .getByRole('link');
      const href = await link.getAttribute('href');
      await gotoApp(authenticatedPage, href!, testInfo);

      const testMessage = `Test message ${Date.now()}`;

      const messageInput = authenticatedPage.locator('[data-testid="message-input"]:visible');
      await messageInput.fill(testMessage);

      const sendButton = authenticatedPage.locator('[data-testid="send-message-button"]:visible');
      await sendButton.click();

      await expect(authenticatedPage.getByText(testMessage)).toBeVisible({ timeout: 10000 });
    });
  });
});
