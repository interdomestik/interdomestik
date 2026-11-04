import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

test.describe('Member Documents Upload Entry', () => {
  test('member documents page shows upload entry per claim card', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, '/member/documents', testInfo, { marker: 'member-documents-page-ready' });

    // Navigation can keep an earlier render hidden in the DOM; only the visible page counts.
    const claimCards = page
      .locator('[data-testid^="member-documents-claim-"]')
      .filter({ visible: true });
    const emptyState = page.getByTestId('member-documents-create-claim');

    await expect
      .poll(
        async () => {
          const cardCount = await claimCards.count();
          if (cardCount > 0) return true;
          return emptyState.isVisible();
        },
        { timeout: 10000 }
      )
      .toBe(true);

    const cardCount = await claimCards.count();

    if (cardCount === 0) {
      await expect(emptyState).toBeVisible();
      return;
    }

    const uploadActions = page
      .locator('[data-testid^="member-documents-upload-"]')
      .filter({ visible: true });
    await expect(uploadActions.first()).toBeVisible();
    await expect(uploadActions).toHaveCount(cardCount);

    const uploadDialog = page.getByRole('dialog');

    await expect
      .poll(
        async () => {
          if (!(await uploadDialog.isVisible())) {
            await uploadActions.first().click({ force: true });
          }

          return uploadDialog.isVisible();
        },
        {
          timeout: 15000,
        }
      )
      .toBe(true);
  });
});
