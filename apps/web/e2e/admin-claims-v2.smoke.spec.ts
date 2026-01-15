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
  await page.getByTestId('login-form').waitFor({ state: 'visible' });
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/(?:member|admin|staff|agent|dashboard)/, { timeout: 30000 });
}

test.describe('Admin Claims V2', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.TENANT_ADMIN_MK);
    // Contract: V2 defaults to Ops Center; list view is explicitly `view=list`.
    await page.goto(`/${DEFAULT_LOCALE}/admin/claims?view=list`);
    await page.waitForLoadState('networkidle');
  });

  test('1. UI: Table has new columns and filters', async ({ page }) => {
    // Verify Filters UI
    // Verify Filters UI with longer timeout for slow loads
    await expect(page.getByTestId('admin-claims-filters')).toBeVisible({ timeout: 30000 });

    // Verify list renders (cards) or shows the empty state.
    const cards = page.getByTestId('claim-operational-card');
    const empty = page.getByText(/Nuk ka kërkesa operative/i);
    await expect(cards.first().or(empty.first())).toBeVisible({ timeout: 10000 });
  });

  test('2. Filters: Assignment Toggle works', async ({ page }) => {
    const unassigned = page.getByTestId('assigned-filter-unassigned');
    await unassigned.click();
    await expect(unassigned).toHaveAttribute('aria-pressed', 'true');

    // Check list updates (cards) or empty state.
    const cards = page.getByTestId('claim-operational-card');
    const empty = page.getByText(/Nuk ka kërkesa operative/i);
    await expect(cards.first().or(empty.first())).toBeVisible({ timeout: 10000 });
  });

  test('3. Filters: Status Chips toggle state', async ({ page }) => {
    const activeStatus = page.getByTestId('status-filter-active');
    await activeStatus.click();
    await expect(activeStatus).toHaveAttribute('aria-pressed', 'true');

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

      // 8a. Each row has exactly 1 primary directive element (Strict Contract)
      const primaryDirective = card.locator('[data-testid^="primary-directive"]');
      await expect(primaryDirective).toHaveCount(1);

      // 8b. Each row has at most 1 unassigned badge (Strict Contract)
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
  test.fixme('9. Phase 2.7: Assignment Flow updates KPIs', async ({ page }) => {
    const unassignedFilter = page.locator('button', { hasText: /pacaktuar|pa caktuar/i }).first();
    const myClaimsFilter = page.locator('button', { hasText: /për mua/i }).first();

    // Wait for validation - ensure filters exist
    await expect(unassignedFilter).toBeVisible();
    await expect(myClaimsFilter).toBeVisible();

    // 2. Identify target claim (Capture ID/Number)
    await unassignedFilter.click();
    await page.waitForLoadState('networkidle');

    // Find a card that definitely has an "Assign owner" badge
    const card = page
      .locator('[data-testid="claim-operational-card"]', {
        has: page.getByTestId('unassigned-badge'),
      })
      .first();

    // Capture the claim number text (e.g. "CLM-2024-...")
    const claimNumberEl = card.getByTestId('claim-identity');
    await expect(claimNumberEl).toBeVisible();
    const claimNumberText = (await claimNumberEl.innerText()).split('\n')[0].trim(); // Assuming "Title \n Number" or similar

    console.log('Testing Assignment on Claim:', claimNumberText);

    // View claim
    await card.getByTestId('view-claim').click();
    await page.waitForLoadState('networkidle');

    // 3. Assign to self (Me)
    const assignBtn = page.locator('button', { hasText: /Më cakto mua/i });
    await expect(assignBtn).toBeVisible();
    await assignBtn.click();

    // 4. Verify Success (UI update)
    await expect(page.getByText('Veprimi u krye')).toBeVisible();
    await expect(assignBtn).not.toBeVisible();

    // 5. Verify via List search (DB Truth Proxy)
    // Go back to list
    await page.getByRole('link', { name: 'Qendra Operacionale' }).click();
    await page.waitForLoadState('networkidle');

    // Search for the specific claim we just assigned
    // This isolates our verification from other parallel tests
    const searchInput = page.locator('input[placeholder*="Kërko"]'); // "Kërko..."
    await searchInput.fill(claimNumberText);
    await searchInput.press('Enter');
    await page.waitForLoadState('networkidle');

    // 6. Assert Badge is GONE for this specific claim
    const targetCard = page.locator('[data-testid="claim-operational-card"]').first();
    await expect(targetCard).toBeVisible();

    // Should NOT have unassigned badge
    const badge = targetCard.getByTestId('unassigned-badge');
    await expect(badge).toHaveCount(0);

    console.log('Verified: Claim', claimNumberText, 'no longer has unassigned badge.');
  });
});
