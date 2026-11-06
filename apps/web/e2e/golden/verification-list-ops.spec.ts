import { OPS_TEST_IDS } from '../../src/components/ops/testids';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

// Every tenant's golden seed has open cash requests, so the queue is never empty here: an empty
// queue is a seed failure, not an accepted state.
test.describe('Verification List Ops (Golden)', () => {
  test('renders ops list primitives, handles selection via URL, and opens drawer', async ({
    adminPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.adminLeads(testInfo), testInfo, { marker: 'verification-ops-page' });

    // The router keeps a hidden copy of a revisited page, so primitives are read where visible.
    await expect(page.getByTestId('verification-kpis').filter({ visible: true })).toBeVisible();
    await expect(page.getByTestId(OPS_TEST_IDS.TABLE.EMPTY).filter({ visible: true })).toHaveCount(
      0
    );

    const firstRow = page.getByTestId('cash-verification-row').filter({ visible: true }).first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page).toHaveURL(/selected=/);

    const drawer = page.getByTestId(OPS_TEST_IDS.DRAWER);
    await expect(drawer).toBeVisible({ timeout: 10000 });

    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(page).not.toHaveURL(/selected=/);
  });
});
