import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

test.describe('Member Documents Upload Entry', () => {
  test('member documents page shows upload entry per claim card', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, '/member/documents', testInfo, { marker: 'member-documents-page-ready' });

    const claimCards = page.locator('[data-testid^="member-documents-claim-"]');
    const cardCount = await claimCards.count();

    if (cardCount === 0) {
      await expect(page.getByTestId('member-documents-create-claim')).toBeVisible();
      return;
    }

    const uploadActions = page.locator('[data-testid^="member-documents-upload-"]');
    await expect(uploadActions.first()).toBeVisible();
    await expect(uploadActions).toHaveCount(cardCount);

    const uploadDialog = page.getByRole('dialog', { name: /upload evidence/i });

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
