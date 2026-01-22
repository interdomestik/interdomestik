import { OPS_TEST_IDS } from '../../src/components/ops/testids';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Pro Claims (Golden)', () => {
  test('Agent can access Pro Claims queue (Read-Only)', async ({ agentPage: page }, testInfo) => {
    // 1. Navigate to Pro Workspace
    await gotoApp(page, routes.agentWorkspace(testInfo), testInfo, { marker: 'agent-pro-shell' });

    // 2. Navigate to Claims Queue
    await expect(async () => {
      await page.locator('a[href*="/agent/workspace/claims"]').click();
      await expect(page).toHaveURL(new RegExp(`.*${routes.agentWorkspaceClaims(testInfo)}`));
    }).toPass({ timeout: 10000 });

    await expect(page.getByTestId('agent-claims-pro-page')).toBeVisible();

    // 3. Verify Table Elements
    await expect(page.getByTestId('ops-filters-bar')).toBeVisible();
    await expect(page.getByTestId('claims-search')).toBeVisible();

    // Headers
    await expect(page.getByRole('columnheader', { name: /Claim/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Status/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Member/i })).toBeVisible();

    // 4. Open Drawer (Click first row if exists)
    const firstRow = page.getByTestId('claim-row').first();

    if (await firstRow.isVisible()) {
      await firstRow.click();

      // 5. Verify Drawer Content
      const drawer = page.getByTestId(OPS_TEST_IDS.DRAWER);
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText(/Details \(Read Only\)/i)).toBeVisible();

      // 6. Verify URL selection
      await expect(page).toHaveURL(/selected=/);

      // 7. Close Drawer
      await page.keyboard.press('Escape');
      await expect(drawer).not.toBeVisible();
      await expect(page).not.toHaveURL(/selected=/);
    } else {
      // Empty state check
      await expect(
        page.getByTestId(OPS_TEST_IDS.TABLE.EMPTY).or(page.getByText(/No claims found/i))
      ).toBeVisible();
    }
  });
});
