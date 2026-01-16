import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Claim Traceability', () => {
  test('Admin can see Claim Number in list and Search by it', async ({ adminPage: page }) => {
    // 1. Navigate to Claims list
    const locale = (process.env.PLAYWRIGHT_LOCALE as 'sq' | 'mk' | 'en') || 'sq';
    await page.goto(routes.adminClaims(locale) + '?view=list');
    await page.waitForLoadState('domcontentloaded');

    // 2. Verify List shows CLM numbers
    // We expect backfilled claims to be visible.
    // Check for ANY text matching CLM- prefix
    const claimNumberLocator = page.getByText(/CLM-[A-Z]{2}-2026-\d+/).first();
    await expect(claimNumberLocator).toBeVisible({ timeout: 15000 });

    // Capture the exact number for Search test
    const claimNumber = await claimNumberLocator.textContent();
    if (!claimNumber) throw new Error('No claim number found');

    // Clean up potential whitespace or extra text
    const cleanClaimNumber = claimNumber.match(/CLM-[A-Z]{2}-2026-\d+/)?.[0];
    if (!cleanClaimNumber) throw new Error(`Could not parse claim number from: ${claimNumber}`);

    // 3. Test Search via URL (more reliable than input events)
    await page.goto(`${routes.adminClaims(locale)}?view=list&search=${cleanClaimNumber}`);
    await page.waitForLoadState('domcontentloaded');

    // Verify filter shows the claim - use polling to wait for async render
    await expect(async () => {
      const claimVisible = await page
        .getByText(cleanClaimNumber)
        .isVisible()
        .catch(() => false);
      expect(claimVisible).toBeTruthy();
    }).toPass({ timeout: 10000 });

    // 4. Test Resolver
    // Navigate to /admin/claims/number/[claimNumber]
    await page.goto(`/${locale}/admin/claims/number/${cleanClaimNumber}`);
    await page.waitForLoadState('domcontentloaded');

    // Should redirect to /admin/claims/[id]?ref=CLM...
    await expect(page).toHaveURL(new RegExp(`admin/claims/`));
    await expect(page).toHaveURL(new RegExp(`ref=${cleanClaimNumber}`));
  });
});
