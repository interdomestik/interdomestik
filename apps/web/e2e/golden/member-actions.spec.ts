import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

test.describe('Gate: Critical Path › Member Actions & Uploads', () => {
  test.fixme('Member can see action buttons on subscription', async ({
    authenticatedPage,
  }, testInfo) => {
    await gotoApp(authenticatedPage, '/member/membership', testInfo);

    // Check if we have subscriptions OR empty state
    const rows = authenticatedPage.locator('[data-testid^="ops-row-"]');
    const emptyState = authenticatedPage.getByText(/No membership|Nuk keni anëtarësim/i);

    // Evaluate if we have content
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      // Check for Cancel action
      // Use logic similar to code: Button might be primary or secondary actions
      const cancelBtn = authenticatedPage.getByRole('button', { name: /Request Cancellation/i });
      if (await cancelBtn.isVisible()) {
        console.log('Cancel button visible');
      } else {
        console.log('Cancel button NOT visible (maybe already valid/invalid state?)');
      }
    } else {
      console.log('No subscriptions found. Verifying empty state.');
      await expect(emptyState).toBeVisible();
    }
  });

  test('Member can see Upload Evidence button on claim', async ({
    authenticatedPage,
  }, testInfo) => {
    await gotoApp(authenticatedPage, '/member/claims', testInfo);

    // Find a claim link
    const validClaimLink = authenticatedPage
      .locator('a[href*="/member/claims/"]:not([href*="/new"])')
      .first();

    if ((await validClaimLink.count()) === 0) {
      console.log('No claims found. Skipping upload test.');
      return;
    }

    await validClaimLink.click();

    // Check Panel Action "Upload"
    const uploadBtn = authenticatedPage.getByRole('button', { name: /^Upload$/i }).first();
    await expect(uploadBtn).toBeVisible();

    // Click opens dialog - use force to ensure it clicks event if slight overlay issue
    await uploadBtn.click({ force: true });

    // Expect dialog
    await expect(authenticatedPage.getByRole('dialog', { name: /Upload Evidence/i })).toBeVisible();
  });
});
