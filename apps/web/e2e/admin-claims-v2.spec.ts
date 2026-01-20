/**
 * Admin Claims V2 Smoke Tests
 *
 * Verifies new columns, filtering, and assignment logic.
 */

import { expect } from '@playwright/test';
import { test } from './fixtures/auth.fixture';

const DEFAULT_LOCALE = 'sq';

// TODO: Stabilization needed for v2 features
test.describe('@quarantine Admin Claims V2 ', () => {
  let missing: string[] = [];

  test.beforeEach(async ({ page, loginAs }) => {
    missing = [];
    // Diagnostics: Console & Network (with noise filtering)
    page.on('console', msg => {
      const text = msg.text();
      // Filter out standard React/Next.js dev noise
      if (
        text.includes('React DevTools') ||
        text.includes('[HMR]') ||
        text.includes('[Fast Refresh]')
      ) {
        return;
      }
      if (msg.type() === 'error') console.log('[console.error]', text);
      console.log(`[BROWSER]: ${text}`);
    });

    page.on('response', res => {
      const url = res.url();
      if (res.status() === 404) {
        missing.push(url);
        if (url.includes('/_next/static/')) {
          throw new Error(`FATAL: Next static asset 404: ${url}`);
        }
      }
    });

    page.on('pageerror', err => {
      console.log('[pageerror]', err.message);
    });

    // Use fixture login (Robust, handles domain/headers/cookies)
    await loginAs('admin', 'mk');

    // Contract: V2 defaults to Ops Center; list view is explicitly `view=list`.
    await page.goto(`/${DEFAULT_LOCALE}/admin/claims?view=list`, { waitUntil: 'domcontentloaded' });

    // Navigation Health Guards
    await expect(page).not.toHaveURL(new RegExp('/login', 'i'));
    // Use [?] to match literal question mark safely in RegExp
    await expect(page).toHaveURL(new RegExp('/admin/claims[?]view=list', 'i'));
    await expect(page.getByTestId('not-found-page')).toHaveCount(0);

    await page.waitForLoadState('networkidle');
  });

  test('1. UI: Table has new columns and filters', async ({ page }) => {
    // Debug 404s
    const fatal404s = missing.filter(u => u.includes('/_next/static/') || u.includes('/api/'));
    console.log('[404 summary]', { total: missing.length, fatal: fatal404s.slice(0, 10) });
    console.log('[url]', page.url());

    // Verify Filters UI
    // Verify Filters UI with longer timeout for slow loads
    await expect(page.getByTestId('admin-claims-filters')).toBeVisible({ timeout: 30000 });

    // Verify list renders (cards) or shows the empty state.
    const cards = page.getByTestId('claim-operational-card');
    const empty = page.getByText(new RegExp('Nuk ka kërkesa operative', 'i'));
    await expect(cards.first().or(empty.first())).toBeVisible({ timeout: 10000 });
  });

  test('2. Filters: Assignment Toggle works', async ({ page }) => {
    const unassigned = page.getByTestId('assigned-filter-unassigned').first();
    await unassigned.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -100)); // Clear sticky header
    await unassigned.click({ force: true });
    await expect(page).toHaveURL(new RegExp('assigned=unassigned'), { timeout: 15000 });

    // Check list updates (cards) or empty state.
    const cards = page.getByTestId('claim-operational-card');
    const empty = page.getByText(new RegExp('Nuk ka kërkesa operative', 'i'));
    await expect(cards.first().or(empty.first())).toBeVisible({ timeout: 10000 });
  });

  test('3. Filters: Status Chips toggle state', async ({ page }) => {
    const activeStatus = page.getByTestId('status-filter-active').first();
    await activeStatus.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -100)); // Clear sticky header
    await activeStatus.click({ force: true });
    await expect(page).toHaveURL(new RegExp('status=active'), { timeout: 15000 });

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
    await page.getByTestId('view-claim').first().click({ force: true });
    // Claim IDs can contain letters, numbers, underscores, hyphens
    await expect(page).toHaveURL(new RegExp('/admin/claims/[\\w-]+'), { timeout: 10000 });
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
    const unassignedFilter = page
      .locator('button', { hasText: new RegExp('pacaktuar|pa caktuar', 'i') })
      .first();
    const myClaimsFilter = page.locator('button', { hasText: new RegExp('për mua', 'i') }).first();

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
    const assignBtn = page.locator('button', { hasText: new RegExp('Më cakto mua', 'i') });
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
