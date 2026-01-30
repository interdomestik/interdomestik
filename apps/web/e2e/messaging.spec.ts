/**
 * Messaging System E2E Tests (STRICT)
 *
 * Verifies messaging functionality on claim detail pages using deterministic seeded data.
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Messaging System', () => {
  const getClaimId = (testInfo: any) => {
    const locale = routes.getLocale(testInfo);
    // sq = KS project, mk = MK project
    return locale === 'sq' ? 'golden_ks_a_claim_01' : 'golden_claim_mk_1';
  };

  test.describe('Member Messaging', () => {
    test('should display messaging panel on claim detail page', async ({
      authenticatedPage,
    }, testInfo) => {
      const claimId = getClaimId(testInfo);

      await gotoApp(authenticatedPage, routes.memberClaimDetail(claimId, testInfo), testInfo, {
        marker: 'claim-tracking-title',
      });

      await expect(authenticatedPage.getByTestId('messaging-panel')).toBeVisible({
        timeout: 10000,
      });
      await expect(authenticatedPage.getByTestId('message-input')).toBeVisible();
      await expect(authenticatedPage.getByTestId('send-message-button')).toBeVisible();
    });
  });

  test.describe('Staff Messaging', () => {
    test('should display messaging panel on staff claim detail page', async ({
      staffPage,
    }, testInfo) => {
      const claimId = getClaimId(testInfo);

      await gotoApp(staffPage, routes.staffClaimDetail(claimId, testInfo), testInfo, {
        marker: 'claim-tracking-title',
      });

      await expect(staffPage.getByTestId('messaging-panel')).toBeVisible({ timeout: 10000 });
      await expect(staffPage.getByTestId('internal-note-toggle')).toBeVisible();
    });
  });

  test.describe('Message Sending', () => {
    test('should send a message and see it appear', async ({ authenticatedPage }, testInfo) => {
      const claimId = getClaimId(testInfo);

      await gotoApp(authenticatedPage, routes.memberClaimDetail(claimId, testInfo), testInfo, {
        marker: 'claim-tracking-title',
      });

      const testMessage = `E2E Test Message ${Date.now()}`;

      await authenticatedPage.getByTestId('message-input').fill(testMessage);
      await authenticatedPage.getByTestId('send-message-button').click();

      // Verify message appears in the thread
      const lastMessage = authenticatedPage.getByTestId('message-content').last();
      await expect(lastMessage).toContainText(testMessage, { timeout: 10000 });
    });
  });
});
