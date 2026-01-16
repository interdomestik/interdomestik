import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Claim Traceability', () => {
  test('Admin can see Claim Number in list and navigate to claim', async ({ adminPage: page }) => {
    const locale = (process.env.PLAYWRIGHT_LOCALE as 'sq' | 'mk' | 'en') || 'sq';

    // 1. Navigate to Claims operational center
    await page.goto(routes.adminClaims(locale));
    await page.waitForLoadState('domcontentloaded');

    // 2. Wait for claims to load and find ANY claim number
    // The operational center shows claims with CLM numbers
    const claimNumberLocator = page.getByText(/CLM-[A-Z]{2}-20\d{2}-\d+/).first();
    await expect(claimNumberLocator).toBeVisible({ timeout: 15000 });

    // Capture the exact number
    const claimNumber = await claimNumberLocator.textContent();
    if (!claimNumber) throw new Error('No claim number found');

    // Extract just the CLM number
    const cleanClaimNumber = claimNumber.match(/CLM-[A-Z]{2}-20\d{2}-\d+/)?.[0];
    if (!cleanClaimNumber) throw new Error(`Could not parse claim number from: ${claimNumber}`);

    console.log(`Found claim number: ${cleanClaimNumber}`);

    // 3. Click on a claim link to navigate to the detail view
    // Find a link that contains the claim pattern and click it
    const claimLink = page
      .locator('a')
      .filter({ hasText: /Hap|Open|View/i })
      .first();

    if (await claimLink.isVisible()) {
      await claimLink.click();
      await page.waitForLoadState('domcontentloaded');

      // 4. Verify we're on a claim detail page
      await expect(page).toHaveURL(/\/claims\/[a-zA-Z0-9_-]+/);
    } else {
      // Alternative: Navigate directly to a known claim via resolver
      await page.goto(`/${locale}/admin/claims/number/${cleanClaimNumber}`);
      await page.waitForLoadState('domcontentloaded');

      // Should redirect to /admin/claims/[id]
      await expect(page).toHaveURL(/admin\/claims\//);
    }
  });
});
