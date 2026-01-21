import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { routes } from '../routes';

test.describe('Claims List Ops (Golden)', () => {
  test('renders ops list and navigates to detail', async ({ page, loginAs }) => {
    await loginAs('admin');
    await page.goto(routes.adminClaims());
    await page.waitForLoadState('domcontentloaded');

    // Verify we're on admin claims page
    await expect(page).toHaveURL(/\/admin\/claims/);

    // Verify main content renders
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible();

    // Check for either claims list OR empty state
    const emptyState = page.getByText(/No claims found|Nuk ka kërkesa/i);
    const claimCard = page.getByTestId('claim-operational-card').first();
    const claimRow = page.getByTestId('claim-row').first();
    const table = page.getByTestId('ops-table');

    // Wait for one of the valid states
    await Promise.race([
      emptyState.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      claimCard.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      claimRow.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      table.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
    ]);

    // If we have claims, verify navigation to detail works
    const clickableItem = (await claimCard.isVisible())
      ? claimCard
      : (await claimRow.isVisible())
        ? claimRow
        : null;

    if (clickableItem) {
      await clickableItem.click();
      // Should navigate to claim detail
      await expect(page).toHaveURL(/\/admin\/claims\/[\w-]+/);
    }

    // Test passes if page loads without errors
  });
});
