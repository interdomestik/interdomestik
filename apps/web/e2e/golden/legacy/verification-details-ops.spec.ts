import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { routes } from '../routes';

test.describe('Verification Details Ops (Golden)', () => {
  test('drawer renders ops kit sections', async ({ page, loginAs }, testInfo) => {
    await loginAs('admin');
    const locale = testInfo.project.name.includes('mk') ? 'mk' : 'sq';
    await page.goto(routes.adminLeads(locale));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    if ((await page.getByTestId('cash-verification-row').count()) === 0) {
      await expect(page.getByTestId('ops-table-empty')).toBeVisible();
      return;
    }

    await page.getByTestId('cash-verification-row').first().click();

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
