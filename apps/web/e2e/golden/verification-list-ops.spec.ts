import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';

test.describe('Verification List Ops (Golden)', () => {
  test('renders ops list primitives and opens drawer', async ({ page, loginAs }) => {
    await loginAs('admin');
    await page.goto('/sq/admin/leads');
    await page.waitForLoadState('networkidle');

    const kpis = page.getByTestId('verification-kpis');
    await expect(kpis).toBeVisible();

    const historyTab = page.getByTestId('view-history');
    await expect(historyTab).toBeVisible();
    await historyTab.click();
    await expect(page).toHaveURL(/view=history/);

    const queueTab = page.getByTestId('view-queue');
    await queueTab.click();
    await expect(page).toHaveURL(/view=queue/);

    const searchInput = page.getByTestId('verification-search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('no-results-ops');
    await expect(page.getByTestId('ops-table-empty')).toBeVisible();
    await searchInput.fill('');

    const firstRow = page.getByTestId('cash-verification-row').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    const drawer = page.getByTestId('ops-drawer');
    await expect(drawer).toBeVisible({ timeout: 10000 });
  });
});
