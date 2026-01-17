import { expect, test } from '../fixtures/auth.fixture';

test.describe('Admin Verification Flow (Golden)', () => {
  test('Tenant Admin can request info via Drawer, search, and toggle views', async ({
    page,
    loginAs,
  }) => {
    // 1. Login as Tenant Admin (KS)
    await loginAs('admin', 'ks');

    // 2. Navigate to Verification Queue
    await page.goto('/sq/admin/leads');
    await page.waitForLoadState('networkidle');

    // 3. Find a pending request (that is NOT already needs_info)
    const row = page
      .getByTestId('cash-verification-row')
      .filter({ has: page.getByRole('button', { name: /Details|Detajet/i }) }) // Ensure it has details button
      .first();
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

    // 4. Open Drawer
    const detailsBtn = row.getByRole('button', { name: /Details|Detajet/i });
    await detailsBtn.click();

    // 5. Verify Drawer Content
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    // Wait for loading to finish (skeleton disappears)
    await expect(drawer.getByText(/Verification Details|Detajet e Verifikimit/i)).toBeVisible();
    await expect(drawer.getByText(/Documents|Dokumentet/i)).toBeVisible();
    await expect(drawer.getByText(/Timeline|Historiku/i)).toBeVisible();

    // 6. Action: Needs Info via Drawer
    // Note: If item is already "needs_info", the actions might be different?
    // My implementation shows actions if status != succeeded && status != rejected.
    // So "needs_info" still shows actions.
    const needsInfoDrawerBtn = drawer.getByRole('button', { name: /Needs Info|Kërko Info/i });
    await expect(needsInfoDrawerBtn).toBeVisible();
    await needsInfoDrawerBtn.click();

    // 7. Fill Note (inline in drawer footer)
    const noteInput = drawer.getByRole('textbox');
    await expect(noteInput).toBeVisible();
    await noteInput.fill('Receipt missing date via Drawer.');

    // 8. Submit
    const submitBtn = drawer.getByRole('button', { name: /Submit|Dërgo/i });
    await submitBtn.click();

    // 9. Verify Success & Drawer Close
    await expect(page.getByText(/Info request sent|Kërkesa për info u dërgua/i)).toBeVisible();
    await expect(drawer).not.toBeVisible();

    // 10. Verify Item status updated to "Needs Info" (It stays in Queue)
    await expect(page.getByText(/Needs Info|Kërkohet Info/i).first()).toBeVisible();

    // 11. Test Search
    const searchInput = page.getByPlaceholder(/Kërko|Search/i);
    await searchInput.fill('NonExistentName123');
    await page.waitForTimeout(1000); // Wait for debounce and fetch

    // Should be empty
    await expect(page.getByText(/Nuk ka kërkesa|No pending/i)).toBeVisible();

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(1000);
    // Should see list again
    await expect(page.getByTestId('cash-verification-row').first()).toBeVisible();

    // 12. Test History Tab
    const historyTab = page.getByRole('tab', { name: /History|Historiku/i });
    await historyTab.click();

    // URL update
    await expect(page).toHaveURL(/view=history/);

    // Check for History specific columns (Status, Verifier)
    await expect(page.getByRole('columnheader', { name: /Status/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Verifikuesi|Verifier/i })).toBeVisible();
  });
});
