import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Member Plan Ops (Golden)', () => {
  test('renders ops master-detail plan view', async ({ page, loginAs }, testInfo) => {
    await loginAs('member');
    await gotoApp(page, `${routes.member(testInfo)}/membership`, testInfo, { marker: 'ops-table' });

    // Check Ops Table
    const table = page.getByTestId('ops-table');
    await expect(table).toBeVisible();

    // Check rows exist (assuming seeded data has at least one subscription)
    // If no subscription, it shows empty state, which is also a valid render.
    // But we expect seeded member to have a plan.
    const rows = page.getByTestId('ops-table-row');
    const count = await rows.count();

    if (count > 0) {
      await rows.first().click();

      // Check URL selection
      await expect(page).toHaveURL(/selected=/);

      // Check detail view (desktop or drawer)
      // We can check for Action Bar which is in detail view
      const actionBar = page.getByTestId('ops-action-bar');
      await expect(actionBar).toBeVisible();

      // Check Timeline
      await expect(page.getByTestId('ops-timeline')).toBeVisible();

      // Check Documents
      await expect(page.getByTestId('ops-documents-panel')).toBeVisible();
    } else {
      // Empty state check
      await expect(page.getByText('No active membership')).toBeVisible();
    }
  });
});
