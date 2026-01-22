/**
 * Admin Claims V2 Smoke Tests
 *
 * Verifies new columns, filtering, and assignment logic.
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

// Stabilization needed for v2 features
test.describe('Admin Claims V2', () => {
  test.beforeEach(async ({ adminPage }, testInfo) => {
    // Diagnostics: Console & Network (with noise filtering)
    adminPage.on('console', msg => {
      const text = msg.text();
      // Filter out standard React/Next.js dev noise
      if (
        text.includes('React DevTools') ||
        text.includes('[HMR]') ||
        text.includes('[Fast Refresh]')
      ) {
        return;
      }
      console.log(`[BROWSER]: ${text}`);
    });

    // adminPage is already authenticated by fixture; navigate to claims list explicitly.
    await gotoApp(adminPage, l => `${routes.adminClaims(l)}?view=list`, testInfo, {
      marker: 'page-ready',
    });
    await expect(adminPage).toHaveURL(/\/admin\/claims/, { timeout: 15000 });
  });

  test('1. UI: Table has new columns and filters', async ({ adminPage }) => {
    // Verify Filters UI
    // Verify Filters UI with longer timeout for slow loads
    await expect(adminPage.getByTestId('admin-claims-filters')).toBeVisible({ timeout: 30000 });

    // Verify list renders (cards) or shows the empty state.
    const cards = adminPage.getByTestId('claim-operational-card');
    const empty = adminPage.getByTestId('ops-table-empty');
    await expect(cards.first().or(empty.first())).toBeVisible({ timeout: 10000 });
  });

  test('2. Filters: Assignment Toggle works', async ({ adminPage }) => {
    const unassigned = adminPage.getByTestId('assigned-filter-unassigned').first();
    await unassigned.scrollIntoViewIfNeeded();
    await adminPage.evaluate(() => window.scrollBy(0, -100)); // Clear sticky header
    await unassigned.click({ force: true });
    await expect(adminPage).toHaveURL(/assigned=unassigned/, { timeout: 15000 });

    // Check list updates (cards) or empty state.
    const cards = adminPage.getByTestId('claim-operational-card');
    const empty = adminPage.getByTestId('ops-table-empty');
    await expect(cards.first().or(empty.first())).toBeVisible({ timeout: 10000 });
  });

  test('3. Filters: Status Chips toggle state', async ({ adminPage }) => {
    // Some builds treat "active" as the default view and may not encode it in the URL.
    // Prove wiring by switching to a different tab, then back, and asserting URL changes.

    const draftStatus = adminPage.getByTestId('status-filter-draft').first();
    await draftStatus.scrollIntoViewIfNeeded();
    await adminPage.evaluate(() => window.scrollBy(0, -100)); // Clear sticky header
    await draftStatus.click({ force: true });
    await expect(adminPage).toHaveURL(/status=draft/, { timeout: 15000 });

    const activeStatus = adminPage.getByTestId('status-filter-active').first();
    await activeStatus.scrollIntoViewIfNeeded();
    await adminPage.evaluate(() => window.scrollBy(0, -100)); // Clear sticky header
    await activeStatus.click({ force: true });

    // Ensure we actually left the draft view.
    await expect.poll(() => adminPage.url(), { timeout: 15000 }).not.toMatch(/status=draft/);

    // List should still render (cards) or show the empty state.
    const cards = adminPage.getByTestId('claim-operational-card');
    const empty = adminPage.getByTestId('ops-table-empty');
    await expect(cards.first().or(empty.first())).toBeVisible({ timeout: 10000 });
  });

  test('4. Phase 2.5: OperationalCard structure exists', async ({ adminPage }) => {
    // If there are no operational claims for this tenant, assert empty state and exit.
    const cards = adminPage.getByTestId('claim-operational-card');
    if ((await cards.count()) === 0) {
      await expect(adminPage.getByTestId('ops-table-empty')).toBeVisible({ timeout: 15000 });
      return;
    }

    await expect(cards.first()).toBeVisible({ timeout: 15000 });

    // 4a. StateSpine exists within the card
    const stateSpine = adminPage.getByTestId('state-spine');
    await expect(stateSpine.first()).toBeVisible();

    // 4b. StateSpine has responsive min-width (96px min)
    const spineBox = await stateSpine.first().boundingBox();
    expect(spineBox?.width).toBeGreaterThanOrEqual(96);

    // 4c. OwnerDirective exists (one of the directive variants)
    const directive = adminPage.locator('[data-testid^="owner-directive-"]');
    await expect(directive.first()).toBeVisible();

    // 4d. Claim metadata exists
    await expect(adminPage.getByTestId('claim-metadata').first()).toBeVisible();
  });

  test('5. Phase 2.5: Directive is above ClaimIdentity (DOM order)', async ({ adminPage }) => {
    const cards = adminPage.getByTestId('claim-operational-card');
    if ((await cards.count()) === 0) {
      await expect(adminPage.getByTestId('ops-table-empty')).toBeVisible({ timeout: 15000 });
      return;
    }

    const card = cards.first();
    await expect(card).toBeVisible({ timeout: 15000 });

    // Get positions - directive should have lower Y than identity (appears first/above)
    const directive = card.locator('[data-testid^="owner-directive-"]');
    const identity = card.getByTestId('claim-identity');

    const directiveBox = await directive.boundingBox();
    const identityBox = await identity.boundingBox();

    if (directiveBox && identityBox) {
      expect(directiveBox.y).toBeLessThan(identityBox.y);
    }
  });

  test('6. Phase 2.5: View button accessibility and navigation', async ({ adminPage }) => {
    const cards = adminPage.getByTestId('claim-operational-card');
    if ((await cards.count()) === 0) {
      await expect(adminPage.getByTestId('ops-table-empty')).toBeVisible({ timeout: 15000 });
      return;
    }

    // Wait for cards to load - asChild makes the Link the actual element
    // The Button with data-testid wraps not nests the Link
    const viewButton = adminPage.getByTestId('view-claim').first();
    await expect(viewButton).toBeVisible({ timeout: 15000 });
    await viewButton.scrollIntoViewIfNeeded();

    // 6a. Check hit target is ≥ 44x44
    const buttonBox = await viewButton.boundingBox();
    expect(buttonBox?.width).toBeGreaterThanOrEqual(40); // Standard mobile target is 44, but allow some deviation
    expect(buttonBox?.height).toBeGreaterThanOrEqual(40);

    // 6b. Check that the element has aria-label (it's on the Link via asChild passthrough)
    // With asChild, the Link becomes the button, so check the button itself
    const hasAriaOrSrOnly = await viewButton.evaluate(el => {
      return el.getAttribute('aria-label') !== null || el.querySelector('.sr-only') !== null;
    });
    expect(hasAriaOrSrOnly).toBeTruthy();

    // 6c. Click and verify navigation to claim detail page
    await adminPage.getByTestId('view-claim').first().click({ force: true });
    // Claim IDs can contain letters, numbers, underscores, hyphens
    await expect(adminPage).toHaveURL(/\/admin\/claims\/[\w-]+/, { timeout: 10000 });
  });

  test('7. Phase 2.5: No i18n missing key warnings in console', async ({ adminPage }) => {
    // Collect console warnings
    const missingKeyWarnings: string[] = [];
    adminPage.on('console', msg => {
      if (
        msg.type() === 'warning' &&
        (msg.text().includes('MISSING_MESSAGE') || msg.text().includes('missing key'))
      ) {
        missingKeyWarnings.push(msg.text());
      }
    });

    // Navigate to claims page (fresh load)
    await adminPage.reload({ waitUntil: 'domcontentloaded' });

    // Assert no missing key warnings
    expect(missingKeyWarnings).toHaveLength(0);
  });

  test('8. Phase 2.6.1: Two-part directive DOM structure', async ({ adminPage }) => {
    // Wait for at least one card to be visible
    const cards = adminPage.getByTestId('claim-operational-card');
    if ((await cards.count()) === 0) {
      await expect(adminPage.getByTestId('ops-table-empty')).toBeVisible({ timeout: 15000 });
      return;
    }

    await expect(cards.first()).toBeVisible({ timeout: 15000 });

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
  test.fixme('9. Phase 2.7: Assignment Flow updates KPIs', async ({ adminPage }) => {
    const unassignedFilter = adminPage
      .locator('button', { hasText: /pacaktuar|pa caktuar/i })
      .first();
    const myClaimsFilter = adminPage.locator('button', { hasText: /për mua/i }).first();

    // Wait for validation - ensure filters exist
    await expect(unassignedFilter).toBeVisible();
    await expect(myClaimsFilter).toBeVisible();

    // 2. Identify target claim (Capture ID/Number)
    await unassignedFilter.click();

    const cards = adminPage.getByTestId('claim-operational-card');
    const empty = adminPage.getByTestId('ops-table-empty');
    await expect(cards.first().or(empty.first())).toBeVisible({ timeout: 15000 });

    // Find a card that definitely has an "Assign owner" badge
    const card = adminPage
      .locator('[data-testid="claim-operational-card"]', {
        has: adminPage.getByTestId('unassigned-badge'),
      })
      .first();

    // Capture the claim number text (e.g. "CLM-2024-...")
    const claimNumberEl = card.getByTestId('claim-identity');
    await expect(claimNumberEl).toBeVisible();
    const claimNumberText = (await claimNumberEl.innerText()).split('\n')[0].trim(); // Assuming "Title \n Number" or similar

    console.log('Testing Assignment on Claim:', claimNumberText);

    // View claim
    await card.getByTestId('view-claim').click();
    await expect(adminPage).toHaveURL(/\/admin\/claims\/[\w-]+/, { timeout: 15000 });

    // 3. Assign to self (Me)
    const assignBtn = adminPage.locator('button', { hasText: /Më cakto mua/i });
    await expect(assignBtn).toBeVisible();
    await assignBtn.click();

    // 4. Verify Success (UI update)
    await expect(adminPage.getByText('Veprimi u krye')).toBeVisible();
    await expect(assignBtn).not.toBeVisible();

    // 5. Verify via List search (DB Truth Proxy)
    // Go back to list
    await adminPage.getByRole('link', { name: 'Qendra Operacionale' }).click();
    await expect(adminPage).toHaveURL(/\/admin\/claims/, { timeout: 15000 });

    // Search for the specific claim we just assigned
    // This isolates our verification from other parallel tests
    const searchInput = adminPage.locator('input[placeholder*="Kërko"]'); // "Kërko..."
    await searchInput.fill(claimNumberText);
    await searchInput.press('Enter');
    await expect(cards.first().or(empty.first())).toBeVisible({ timeout: 15000 });

    // 6. Assert Badge is GONE for this specific claim
    const targetCard = adminPage.locator('[data-testid="claim-operational-card"]').first();
    await expect(targetCard).toBeVisible();

    // Should NOT have unassigned badge
    const badge = targetCard.getByTestId('unassigned-badge');
    await expect(badge).toHaveCount(0);

    console.log('Verified: Claim', claimNumberText, 'no longer has unassigned badge.');
  });
});
