import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';

test.describe('Verification Details Ops (Golden)', () => {
  test('drawer renders ops kit sections', async ({ page, loginAs }) => {
    await loginAs('admin');
    await page.goto('/sq/admin/leads');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const detailsBtn = page.getByTestId('verification-details-button').first();
    await expect(detailsBtn).toBeVisible();
    await detailsBtn.evaluate(node => (node as HTMLElement).click());

    const drawer = page.getByTestId('ops-drawer');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    const docsPanel = drawer.getByTestId('ops-documents-panel');
    await expect(docsPanel).toBeVisible();
    const docsRows = docsPanel.getByTestId('ops-document-row');
    if ((await docsRows.count()) === 0) {
      await expect(docsPanel.getByTestId('ops-documents-empty')).toBeVisible();
    } else {
      await expect(docsRows.first()).toBeVisible();
    }

    const timeline = drawer.getByTestId('ops-timeline');
    await expect(timeline).toBeVisible();
    await expect(timeline.getByTestId('ops-timeline-item').first()).toBeVisible();

    const actionBar = drawer.getByTestId('ops-action-bar');
    await expect(actionBar).toBeVisible();
    await expect(drawer.getByTestId('ops-action-approve')).toBeVisible();
    await expect(drawer.getByTestId('ops-action-needs-info')).toBeVisible();
    await expect(drawer.getByTestId('ops-action-reject')).toBeVisible();
  });
});
