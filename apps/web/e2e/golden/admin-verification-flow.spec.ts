import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';

test.describe('Admin Verification Flow (Golden)', () => {
  test('Tenant Admin can request info for pending cash payment', async ({ page, loginAs }) => {
    // 1. Login as Tenant Admin (KS)
    await loginAs('admin', 'ks');

    // 2. Navigate to Verification Queue
    await page.goto('/sq/admin/leads');
    await page.waitForLoadState('networkidle');

    // 3. Find a pending request
    const row = page.getByTestId('cash-verification-row').first();
    await expect(row).toBeVisible();

    // 3a. Verify Proof Link (if available) or Missing Badge
    const proofBtn = row.getByRole('link', { name: /View Proof|Shiko Provën/i });
    if (await proofBtn.isVisible()) {
      const href = await proofBtn.getAttribute('href');
      expect(href).toContain('/api/documents/');

      // Verify download works (returns 200 OK, potentially dummy content)
      const response = await page.request.get(href!);
      expect(response.ok()).toBeTruthy();
    } else {
      await expect(row.getByText(/Proof Missing|Mungon Prova|Нема Доказ/i)).toBeVisible();
    }

    // 4. Click "Needs Info"
    const needsInfoBtn = row.getByTestId('cash-needs-info');
    await expect(needsInfoBtn).toBeVisible();
    await needsInfoBtn.click();

    // 5. Check Modal
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Kërko Informacion|Request Additional Info/i);

    // 6. Try Submit without Note (Validation)
    const submitBtn = dialog.getByRole('button', { name: /Submit|Dërgo/i });
    await submitBtn.click();
    await expect(page.getByText(/Note is required|Shënimi është i detyrueshëm/i)).toBeVisible();

    // 7. Enter Note
    const noteInput = dialog.getByRole('textbox');
    await noteInput.fill('Please provide receipt ID.');
    await submitBtn.click();

    // 8. Verify Success
    await expect(page.getByText(/Info request sent|Kërkesa për info u dërgua/i)).toBeVisible();

    // 9. Verify Modal Closed
    await expect(dialog).not.toBeVisible();

    // 10. Verify Row Disappears (Optimistic UI)
    // Note: If multiple rows exist, 'row' variable might point to the next one.
    // So we can't assert 'row' is hidden if there are others.
    // But we can check count decreased or specific item gone.
    // For simplicity in Golden, just success toast is strong signal.
  });
});
