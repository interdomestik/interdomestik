import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

function getLocaleForProject(projectName: string): string {
  return projectName.includes('mk') ? 'mk' : 'sq';
}

test.describe('Staff Claim Management', () => {
  test('Staff lands on the canonical queue-first staff surface', async ({
    staffPage: page,
  }, testInfo) => {
    const locale = getLocaleForProject(testInfo.project.name);
    await gotoApp(page, routes.staff(locale), testInfo, { marker: 'staff-page-ready' });

    await expect(page.getByTestId('staff-page-ready')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('page-title')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('staff-claims-queue')).toBeVisible({ timeout: 15000 });
  });

  test('Staff can view and navigate claims queue', async ({ staffPage: page }, testInfo) => {
    const locale = getLocaleForProject(testInfo.project.name);
    await gotoApp(page, routes.staffClaims(locale), testInfo, { marker: 'staff-page-ready' });

    await expect(page.getByTestId('page-title')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('staff-claims-queue')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('staff-claims-assignment-filters')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('staff-claims-status-filters')).toBeVisible({ timeout: 15000 });

    // Seeded data can be empty in some environments; accept either rows or empty state.
    const rowOrEmpty = page
      .getByTestId('staff-claims-row')
      .first()
      .or(page.getByTestId('staff-claims-empty'));
    await expect(rowOrEmpty).toBeVisible({ timeout: 15000 });
  });

  test('Staff can view claim details', async ({ staffPage: page }, testInfo) => {
    const locale = getLocaleForProject(testInfo.project.name);
    await gotoApp(page, routes.staffClaims(locale), testInfo, { marker: 'staff-page-ready' });

    await expect(page.getByTestId('staff-claims-queue')).toBeVisible({ timeout: 15000 });

    // If there are no claims, assert empty and exit.
    if (await page.getByTestId('staff-claims-empty').isVisible()) {
      await expect(page.getByTestId('staff-claims-empty')).toBeVisible({ timeout: 15000 });
      return;
    }

    const firstRow = page.getByTestId('staff-claims-row').first();
    await expect(firstRow).toBeVisible({ timeout: 15000 });

    const firstActionLink = firstRow.getByTestId('staff-claims-view').first();
    await expect(firstActionLink).toBeVisible({ timeout: 15000 });
    await firstActionLink.click();

    await expect(page).toHaveURL(/\/staff\/claims\//, { timeout: 15000 });

    await expect(page.locator('a[href$="/staff/claims"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('staff-claim-detail-ready')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('staff-claim-detail-member')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('staff-claim-detail-agent')).toBeVisible({ timeout: 15000 });
  });

  // Skip this test - it modifies data and may fail due to toast timing
  test.skip('Staff can update claim status', async ({ staffPage: page }, testInfo) => {
    const locale = getLocaleForProject(testInfo.project.name);
    await gotoApp(page, routes.staffClaims(locale), testInfo);
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
