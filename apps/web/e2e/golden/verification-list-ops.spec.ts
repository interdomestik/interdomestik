import { OPS_TEST_IDS } from '../../src/components/ops/testids';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Verification List Ops (Golden)', () => {
  test('renders ops list primitives, handles selection via URL, and opens drawer', async ({
    adminPage: page,
  }, testInfo) => {
    // 1. Navigate to Verification Center
    await gotoApp(page, routes.adminLeads(testInfo), testInfo, { marker: 'verification-ops-page' });

    const kpis = page.getByTestId('verification-kpis');
    await expect(kpis).toBeVisible();

    // 2. URL Sync & Drawer Open on Selection
    // Rows have data-testid="cash-verification-row"
    const firstRow = page.getByTestId('cash-verification-row').first();

    // If no rows, we check empty state (standard ops behavior)
    const emptyState = page.getByTestId(OPS_TEST_IDS.TABLE.EMPTY);

    if (await firstRow.isVisible()) {
      await firstRow.click();

      // Assert URL update
      await expect(page).toHaveURL(/selected=/);

      const drawer = page.getByTestId(OPS_TEST_IDS.DRAWER);
      await expect(drawer).toBeVisible({ timeout: 10000 });

      // 3. Drawer Close handling
      await page.keyboard.press('Escape');
      await expect(drawer).not.toBeVisible();
      await expect(page).not.toHaveURL(/selected=/);
    } else {
      await expect(emptyState).toBeVisible();
    }
  });
});
