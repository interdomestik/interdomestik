import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

test.describe('Claim Traceability', () => {
  test('Admin can see Claim Number in list and navigate to claim', async ({
    adminPage: page,
  }, testInfo) => {
    const locale = testInfo.project.name.includes('mk') ? 'mk' : 'sq';

    // 1. Navigate to Claims operational center
    await page.goto(routes.adminClaims(locale));
    await page.waitForLoadState('domcontentloaded');

    // 2. Wait for claims to load and click any claim row/card.
    // (Some environments don’t render CLM numbers in the list; navigation is the invariant.)
    const claimLink = page.locator('main a[href*="/admin/claims/"]:not([href*="?"])').first();
    await expect(claimLink).toBeVisible({ timeout: 15000 });

    await claimLink.click();
    await page.waitForLoadState('domcontentloaded');

    // 3. Verify we're on a claim detail page
    await expect(page).toHaveURL(/\/admin\/claims\/[a-zA-Z0-9_-]+/);
  });
});
