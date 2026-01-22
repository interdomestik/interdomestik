import { OPS_TEST_IDS } from '../../src/components/ops/testids';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Verification Details Ops (Golden)', () => {
  test('drawer renders ops kit sections', async ({ adminPage: page }, testInfo) => {
    // 1. Navigate to Verification Center
    await gotoApp(page, routes.adminLeads(testInfo), testInfo, { marker: 'verification-ops-page' });

    // 2. Locate and open first item
    const detailsBtn = page.getByTestId('verification-details-button').first();

    if (!(await detailsBtn.isVisible())) {
      test.skip(true, 'No verification requests available to test details drawer');
      return;
    }

    await detailsBtn.click();

    // 3. Verify Drawer Opens
    const drawer = page.getByTestId(OPS_TEST_IDS.DRAWER);
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // 4. Verify Ops Kit Sections
    // Documents Panel
    const docsPanel = drawer.getByTestId(OPS_TEST_IDS.DOCUMENTS.PANEL);
    await expect(docsPanel).toBeVisible();

    // Timeline
    const timeline = drawer.getByTestId(OPS_TEST_IDS.TIMELINE.ROOT);
    await expect(timeline).toBeVisible();
    await expect(timeline.getByTestId(OPS_TEST_IDS.TIMELINE.ITEM).first()).toBeVisible();

    // Action Bar
    const actionBar = drawer.getByTestId(OPS_TEST_IDS.ACTION_BAR);
    await expect(actionBar).toBeVisible();

    // Core Actions (using identified IDs from adapter or UI)
    await expect(drawer.getByTestId('ops-action-approve')).toBeVisible();
    await expect(drawer.getByTestId('ops-action-reject')).toBeVisible();
  });
});
