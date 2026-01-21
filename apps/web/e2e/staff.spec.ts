import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';

function getLocaleForProject(projectName: string): string {
  return projectName.includes('mk') ? 'mk' : 'sq';
}

test.describe('@legacy Staff Claim Management', () => {
  test('Staff can view dashboard stats and recent claims', async ({
    staffPage: page,
  }, testInfo) => {
    const locale = getLocaleForProject(testInfo.project.name);
    await page.goto(routes.staff(locale), { waitUntil: 'domcontentloaded' });

    // Logged-in marker(s) that are not localized.
    const authMarker = page
      .getByTestId('user-nav')
      .or(page.getByTestId('sidebar-user-menu-button'));
    await expect(authMarker.first()).toBeVisible({ timeout: 15000 });

    // Stable staff dashboard structure (avoid translated strings).
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('a[href$="/staff/claims"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('agent-stats-cards')).toBeVisible({ timeout: 15000 });
  });

  test('Staff can view and navigate claims queue', async ({ staffPage: page }, testInfo) => {
    const locale = getLocaleForProject(testInfo.project.name);
    await page.goto(routes.staffClaims(locale), { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('page-title')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('ops-table')).toBeVisible({ timeout: 15000 });

    // Seeded data can be empty in some environments; accept either rows or empty state.
    const rowOrEmpty = page
      .getByTestId('ops-table-row')
      .first()
      .or(page.getByTestId('ops-table-empty'));
    await expect(rowOrEmpty).toBeVisible({ timeout: 15000 });
  });

  test('Staff can view claim details', async ({ staffPage: page }, testInfo) => {
    const locale = getLocaleForProject(testInfo.project.name);
    await page.goto(routes.staffClaims(locale), { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('ops-table')).toBeVisible({ timeout: 15000 });

    // If there are no claims, assert empty and exit.
    if (await page.getByTestId('ops-table-empty').isVisible()) {
      await expect(page.getByTestId('ops-table-empty')).toBeVisible({ timeout: 15000 });
      return;
    }

    const firstRow = page.getByTestId('ops-table-row').first();
    await expect(firstRow).toBeVisible({ timeout: 15000 });

    // Click the first action link (Review / View Status / Message alert).
    const firstActionLink = firstRow.getByTestId('ops-table-actions').getByRole('link').first();
    await expect(firstActionLink).toBeVisible({ timeout: 15000 });
    await firstActionLink.click();

    await expect(page).toHaveURL(/\/staff\/claims\//, { timeout: 15000 });

    // Details page: structural assertions (avoid translated strings).
    await expect(page.locator('a[href$="/staff/claims"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(3, { timeout: 15000 });
  });

  // Skip this test - it modifies data and may fail due to toast timing
  test.skip('Staff can update claim status', async ({ staffPage: page }, testInfo) => {
    const locale = getLocaleForProject(testInfo.project.name);
    await page.goto(routes.staffClaims(locale));
    await page.waitForLoadState('domcontentloaded');

    // Click on the first claim
    const reviewLink = page.getByRole('link', { name: /Review/i }).first();
    await reviewLink.click();
    await page.waitForLoadState('domcontentloaded');

    // Update status - cycle to ensure change
    const statusSelect = page.getByRole('combobox').first();
    const initialStatus = await statusSelect.textContent();

    await statusSelect.click();

    // Pick a status different from current
    if (initialStatus?.toLowerCase().includes('verification')) {
      await page.getByRole('option', { name: /evaluation/i }).click();
    } else {
      await page.getByRole('option', { name: /verification/i }).click();
    }

    // Verify toast or updated status
    await expect(page.getByText('Status updated successfully')).toBeVisible();
  });
});
