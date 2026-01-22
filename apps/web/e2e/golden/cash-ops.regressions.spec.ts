import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

/**
 * Cash Ops Regressions (Golden Flow)
 *
 * Covers: Lead Creation -> Cash Payment -> BM Verification -> Admin Queue
 */
test.describe('Golden Flow: Cash Operations', () => {
  // Use serial mode because tests depend on data created in previous steps
  test.describe.configure({ mode: 'serial' });

  let sharedLeadEmail: string;

  test('1. Agent: Create lead and initiate cash payment', async ({ agentPage: page }, testInfo) => {
    sharedLeadEmail = `smoke.balkan.${Date.now()}@test.com`;

    // 1. Navigate to leads page
    await gotoApp(page, routes.agentLeads(testInfo), testInfo, { marker: 'page-ready' });

    // 2. Create New Lead
    await page.getByTestId('new-lead-button').click();

    const form = page.getByTestId('create-lead-form');
    await expect(form).toBeVisible();

    await form.getByTestId('lead-form-firstname').fill('Smoke');
    await form.getByTestId('lead-form-lastname').fill('Test');
    await form.getByTestId('lead-form-email').fill(sharedLeadEmail);
    await form.getByTestId('lead-form-phone').fill('+38970888888');
    await form.getByTestId('lead-form-submit').click();

    // 3. Verify Lead created and in list
    // gotoApp handles wait for marker, but here we just submitted a form
    await expect(form).toBeHidden({ timeout: 15000 });

    const row = page.getByTestId('lead-row').filter({ hasText: sharedLeadEmail }).first();
    await expect(row).toBeVisible({ timeout: 15000 });

    // 4. Initiate Cash Payment
    await row.click(); // Open drawer
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    // Revel secondary actions
    await drawer.getByTestId('more-actions-button').click();

    const payBtn = drawer.getByTestId('pay-cash-button');
    await expect(payBtn).toBeVisible();
    await payBtn.click();

    // 5. Verify status changed to Waiting Approval (PAYMENT PENDING in UI)
    await expect(drawer.getByTestId('ops-status-badge')).toContainText(/PAYMENT PENDING/i, {
      timeout: 10000,
    });
  });

  test('2. Branch Manager: Verify cash payment', async ({ branchManagerPage: page }, testInfo) => {
    // 1. Navigate to Verification Queue (Admin Leads page)
    await gotoApp(page, routes.adminLeads(testInfo), testInfo, { marker: 'page-ready' });

    // 2. Find the row for our lead
    const row = page
      .getByTestId('cash-verification-row')
      .filter({ hasText: sharedLeadEmail })
      .first();
    await expect(row).toBeVisible({ timeout: 15000 });

    // 3. Approve
    await row.getByTestId('cash-approve').click();

    // 4. Verify Success (Row should disappear from queue)
    await expect(row).toBeHidden({ timeout: 10000 });
  });

  test('3. Cash Ops: Verification queue loads and allows processing (Admin)', async ({
    adminPage: page,
  }, testInfo) => {
    // 1. Navigate to Verification Center
    await gotoApp(page, routes.adminLeads(testInfo), testInfo, { marker: 'page-ready' });

    // 2. VERIFY ROUTING: Check Page Title/Header
    await expect(page.getByTestId('verification-ops-page')).toBeVisible();

    // 3. Content Check (Row OR Empty State)
    const rows = page.getByTestId('cash-verification-row');
    const emptyState = page.getByTestId('ops-table-empty');

    await expect(rows.first().or(emptyState)).toBeVisible();

    if ((await rows.count()) > 0) {
      console.log('Verification queue has items, testing processing logic...');

      // Try to reject the first one (not necessarily our lead from step 1 since it's already approved)
      const firstRow = rows.first();

      // We expect this row to disappear after rejection
      await firstRow.getByTestId('cash-reject').click();

      // Handle Dialog
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog
        .getByTestId('verification-action-note')
        .fill('Rejecting for E2E test smoke check.');
      await dialog.getByTestId('verification-action-submit').click();

      await expect(dialog).toBeHidden();

      // Force reload to ensure fresh data from server (handles potential UI sync issues)
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Wait for the specific row to be removed from the DOM
      await expect(firstRow).toBeHidden({ timeout: 10000 });
    } else {
      console.log('Verification queue is empty (contract fulfilled).');
      await expect(emptyState).toBeVisible();
    }
  });
});
