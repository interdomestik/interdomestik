import { expect, test } from '@playwright/test';

test.describe('Claim Traceability', () => {
  // Use seeded users (assuming 'ops-admin' exists or similar)
  // We'll use the "KS" tenant admin from seeds.

  test('Admin can see Claim Number in list and Search by it', async ({ page }) => {
    // 1. Login as KS Admin
    // Assuming standard login flow or restore storage.
    // For simplicity, we do full login to ensure session.
    await page.goto('/en/login');
    await page.getByLabel('Email').fill('admin-ks@interdomestik.com'); // Seeded KS admin
    await page.getByLabel('Password').fill('AdminPassword123!');
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page).toHaveURL(/.*\/admin/); // Wait for redirect

    // 2. Navigate to Claims
    await page.goto('/en/admin/claims?view=list');

    // 3. Verify List shows CLM numbers
    // We expect backfilled claims to be visible.
    // Check for ANY text matching CLM-XK-2026-
    const claimNumberLocator = page.getByText(/CLM-XK-2026-\d{6}/).first();
    await expect(claimNumberLocator).toBeVisible();

    // Capture the exact number for Search test
    const claimNumber = await claimNumberLocator.textContent();
    expect(claimNumber).toMatch(/^CLM-XK-2026-\d{6}$/);

    if (!claimNumber) throw new Error('No claim number found');

    // 4. Test Search
    const searchInput = page.getByPlaceholder(/search/i); // More flexible
    await searchInput.fill(claimNumber);
    await searchInput.press('Enter'); // Or wait for debounce

    // Verify filter works (row still visible)
    await expect(page.getByText(claimNumber)).toBeVisible();
    // Verify NOT seeing other stuff (optional, hard to prove without knowing state)

    // 5. Test Resolver
    // Navigate to /admin/claims/number/[claimNumber]
    await page.goto(`/en/admin/claims/number/${claimNumber}`);

    // Should redirect to /admin/claims/[id]
    // URL pattern: /en/admin/claims/
    await expect(page).toHaveURL(/\/en\/admin\/claims\/[a-zA-Z0-9_-]+(\?.*)?$/);

    // Check param ref=...
    // The implementation (Step 588) appends ?ref=NUMBER
    await expect(page).toHaveURL(new RegExp(`ref=${claimNumber}`));
  });
});
