import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

test.describe('Member Documents Upload Entry', () => {
  test('member documents page shows upload entry per claim card', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, '/member/documents', testInfo, { marker: 'body' });

    const claimCards = page.locator('[data-testid^="member-documents-claim-"]');
    const cardCount = await claimCards.count();

    if (cardCount === 0) {
      await expect(page.getByRole('link', { name: /create claim|krijo kërkesë/i })).toBeVisible();
      return;
    }

    const uploadActions = page.locator('[data-testid^="member-documents-upload-"]');
    await expect(uploadActions.first()).toBeVisible();
    await expect(uploadActions).toHaveCount(cardCount);

    const uploadDialog = page.getByRole('dialog', { name: /upload evidence/i });

    // First click can race hydration under CI load; retry once before failing.
    await uploadActions.first().click();
    if (!(await uploadDialog.isVisible())) {
      await uploadActions.first().click({ force: true });
    }

    await expect(uploadDialog).toBeVisible({ timeout: 15000 });
  });
});
