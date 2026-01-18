import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { routes } from '../routes';

test.describe('Claims List Ops (Golden)', () => {
  test('renders ops list primitives and navigates to detail', async ({ page, loginAs }) => {
    await loginAs('admin');
    await page.goto(`${routes.adminClaims()}?view=list`);
    await page.waitForLoadState('networkidle');

    const filtersBar = page.getByTestId('ops-filters-bar');
    await expect(filtersBar).toBeVisible();

    const searchInput = page.getByTestId('claims-search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('no-results-ops');
    await expect(page.getByTestId('ops-table-empty')).toBeVisible();
    await searchInput.fill('');

    const firstRow = page.getByTestId('claim-operational-card').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page).toHaveURL(/\/admin\/claims\/[\w-]+/);

    const docsPanel = page.getByTestId('ops-documents-panel');
    await expect(docsPanel).toBeVisible({ timeout: 10000 });
  });
});
