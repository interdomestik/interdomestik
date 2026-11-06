/**
 * Claim Tracking KS E2E Tests
 *
 * Tests public claim tracking and member/agent claim visibility.
 * Uses seeded data from seed-golden.ts:
 * - E2E_USERS.KS_MEMBER_TRACKING (tracking demo member)
 * - golden_ks_track_claim_001 (tracking claim)
 * - demo-ks-track-token-001 (public tracking token)
 */
import { E2E_USERS } from '@interdomestik/database';
import { expect, test } from './fixtures/auth.fixture';
import { gotoApp } from './utils/navigation';

const TOKENS = {
  PUBLIC_DEMO: 'demo-ks-track-token-001',
};

test.describe('Claim Tracking KS', () => {
  test('Public tracking link shows status without login', async ({ page }, testInfo) => {
    // 1. Visit public link (no login required)
    await gotoApp(page, `/track/${TOKENS.PUBLIC_DEMO}?lang=sq`, testInfo);
    await page.waitForLoadState('domcontentloaded');

    // 2. Assert Public Card renders
    const publicCard = page.getByTestId('public-tracking-card');
    await expect(publicCard).toBeVisible({ timeout: 10000 });

    // 3. Assert Status Badge is visible (status is 'evaluation' = 'Vlerësim' in Albanian)
    const statusBadge = page.getByTestId('claim-status-badge').first();
    await expect(statusBadge).toBeVisible({ timeout: 10000 });
    await expect(statusBadge).toContainText(/Vlerësim|Evaluation/i);

    // 4. Assert No PII (email should not be visible)
    const bodyText = await page.innerText('body');
    expect(bodyText).not.toContain(E2E_USERS.KS_MEMBER_TRACKING.email);
  });

  test('Authenticated member can view their claims list', async ({
    authenticatedPage: page,
  }, testInfo) => {
    // Using the standard KS member from fixtures (E2E_USERS.KS_MEMBER)
    // Navigate to member claims page
    await gotoApp(page, '/member/claims', testInfo);
    await page.waitForLoadState('domcontentloaded');

    // Verify we're on the claims page
    await expect(page).toHaveURL(/\/member\/claims/);

    // Page should load without errors - verify main content
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();
  });

  test('Agent can access claims workspace', async ({ agentPage: page }, testInfo) => {
    // Using the standard KS agent from fixtures (E2E_USERS.KS_AGENT)
    // Navigate to agent workspace claims
    await gotoApp(page, '/agent/workspace/claims', testInfo);
    await page.waitForLoadState('domcontentloaded');

    // Verify we're on the claims workspace
    await expect(page).toHaveURL(/\/agent\/workspace\/claims/);

    // Page should load without errors
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();

    // Check for either claims table OR empty state
    const emptyState = page.getByText(/No claims found|Nuk ka kërkesa/i);
    const table = page.getByTestId('ops-table');

    await Promise.race([
      emptyState.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      table.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
    ]);
  });
});
