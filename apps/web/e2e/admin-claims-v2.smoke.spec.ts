/**
 * Admin Claims V2 Smoke Tests
 *
 * Verifies new columns, filtering, and assignment logic.
 */

import { expect, test } from '@playwright/test';

const PASSWORD = 'GoldenPass123!';
const DEFAULT_LOCALE = 'sq';

const USERS = {
  TENANT_ADMIN_MK: { email: 'admin.mk@interdomestik.com', password: PASSWORD, tenant: 'tenant_mk' },
};

async function loginAs(
  page: import('@playwright/test').Page,
  user: { email: string; password: string; tenant: string }
) {
  await page.goto(`/${DEFAULT_LOCALE}/login?tenantId=${user.tenant}`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"], input[placeholder*="@"]').first().fill(user.email);
  await page.locator('input[type="password"]').first().fill(user.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/(?:member|admin|staff|agent|dashboard)/, { timeout: 30000 });
}

test.describe('Admin Claims V2', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.TENANT_ADMIN_MK);
    await page.goto(`/${DEFAULT_LOCALE}/admin/claims`);
    await page.waitForLoadState('networkidle');
  });

  test('1. UI: Table has new columns and filters', async ({ page }) => {
    // Verify Filters UI
    // Verify Filters UI with longer timeout for slow loads
    await expect(page.getByTestId('admin-claims-filters')).toBeVisible({ timeout: 30000 });

    // Verify Group Headers (by text, assuming 'sq' locale)
    // The new design groups by status like "Dorëzuar", "Vlerësim", etc.
    // OR shows "Nuk ka rezultate" if empty.
    const groupHeader = page.getByText(/Dorëzuar|Vlerësim|Skicë|Zgjidhur|Nuk ka rezultate/);
    await expect(groupHeader.first()).toBeVisible({ timeout: 5000 });
  });

  test('2. Filters: Assignment Toggle works', async ({ page }) => {
    // Click "Te pacaktuara" (Unassigned)
    await page.locator('button', { hasText: 'Të pacaktuara' }).click();

    // Check URL
    await expect(page).toHaveURL(/assigned=unassigned/);

    // Check if rows update (optional: wait for network idle)
    await page.waitForLoadState('networkidle');

    // Check filtering result: either rows with "Në pritje" (Waiting on system/admin) or "No results"
    // "I Pacaktuar" was incorrect. New UI uses "Në pritje të..." (Waiting on...)
    const unassignedText = await page.getByText(/Në pritje/).count();
    const noResults = await page.getByText(/Nuk ka rezultate/).count();
    expect(unassignedText + noResults).toBeGreaterThan(0);
  });

  test('3. Filters: Status Chips toggle URL', async ({ page }) => {
    // Click "Vlerësim" (evaluation) status filter button
    await page.locator('button', { hasText: 'Vlerësim' }).click();

    // Check URL has status=evaluation
    await expect(page).toHaveURL(/status=evaluation/);

    // Verify chips visual state (if possible) or just result filtering
    // We trust backend filtering logic, smoke test verifies wiring.
  });

  test('4. Phase 2.5: OperationalCard structure exists', async ({ page }) => {
    // Assert at least one OperationalCard exists
    const cards = page.getByTestId('claim-operational-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    // 4a. StateSpine exists within the card
    const stateSpine = page.getByTestId('state-spine');
    await expect(stateSpine.first()).toBeVisible();

    // 4b. StateSpine has responsive min-width (96px min)
    const spineBox = await stateSpine.first().boundingBox();
    expect(spineBox?.width).toBeGreaterThanOrEqual(96);

    // 4c. OwnerDirective exists (one of the directive variants)
    const directive = page.locator('[data-testid^="owner-directive-"]');
    await expect(directive.first()).toBeVisible();

    // 4d. Claim metadata exists
    await expect(page.getByTestId('claim-metadata').first()).toBeVisible();
  });

  test('5. Phase 2.5: Directive is above ClaimIdentity (DOM order)', async ({ page }) => {
    // Find the first operational card
    const card = page.getByTestId('claim-operational-card').first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Get positions - directive should have lower Y than identity (appears first/above)
    const directive = card.locator('[data-testid^="owner-directive-"]');
    const identity = card.getByTestId('claim-identity');

    const directiveBox = await directive.boundingBox();
    const identityBox = await identity.boundingBox();

    if (directiveBox && identityBox) {
      expect(directiveBox.y).toBeLessThan(identityBox.y);
    }
  });

  test('6. Phase 2.5: View button accessibility and navigation', async ({ page }) => {
    // Wait for cards to load - asChild makes the Link the actual element
    // The Button with data-testid wraps not nests the Link
    const viewButton = page.getByTestId('view-claim').first();
    await expect(viewButton).toBeVisible({ timeout: 10000 });

    // 6a. Check hit target is ≥ 44x44
    const buttonBox = await viewButton.boundingBox();
    expect(buttonBox?.width).toBeGreaterThanOrEqual(44);
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44);

    // 6b. Check that the element has aria-label (it's on the Link via asChild passthrough)
    // With asChild, the Link becomes the button, so check the button itself
    const hasAriaOrSrOnly = await viewButton.evaluate(el => {
      return el.getAttribute('aria-label') !== null || el.querySelector('.sr-only') !== null;
    });
    expect(hasAriaOrSrOnly).toBeTruthy();

    // 6c. Click and verify navigation to claim detail page
    await viewButton.click();
    // Claim IDs can contain letters, numbers, underscores, hyphens
    await expect(page).toHaveURL(/\/admin\/claims\/[\w-]+/, { timeout: 10000 });
  });

  test('7. Phase 2.5: No i18n missing key warnings in console', async ({ page }) => {
    // Collect console warnings
    const missingKeyWarnings: string[] = [];
    page.on('console', msg => {
      if (
        msg.type() === 'warning' &&
        (msg.text().includes('MISSING_MESSAGE') || msg.text().includes('missing key'))
      ) {
        missingKeyWarnings.push(msg.text());
      }
    });

    // Navigate to claims page (fresh load)
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Assert no missing key warnings
    expect(missingKeyWarnings).toHaveLength(0);
  });

  test('8. Phase 2.6.1: Two-part directive DOM structure', async ({ page }) => {
    // Wait for at least one card to be visible
    const cards = page.getByTestId('claim-operational-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    // Get all visible cards
    const cardCount = await cards.count();

    for (let i = 0; i < Math.min(cardCount, 5); i++) {
      const card = cards.nth(i);

      // 8a. Each row has exactly 1 primary directive element
      const primaryDirective = card.getByTestId('primary-directive');
      await expect(primaryDirective).toHaveCount(1);

      // 8b. Each row has at most 1 unassigned badge
      const unassignedBadge = card.getByTestId('unassigned-badge');
      const badgeCount = await unassignedBadge.count();
      expect(badgeCount).toBeLessThanOrEqual(1);

      // 8c. Primary directive appears above title in DOM order
      const title = card.getByTestId('claim-identity');
      const primaryBox = await primaryDirective.boundingBox();
      const titleBox = await title.boundingBox();

      if (primaryBox && titleBox) {
        expect(primaryBox.y).toBeLessThan(titleBox.y);
      }
    }
  });
});
