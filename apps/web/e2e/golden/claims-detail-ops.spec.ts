import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Claims Detail Ops (Golden)', () => {
  test('renders ops kit sections', async ({ page, loginAs }, testInfo) => {
    await loginAs('admin');
    await gotoApp(page, `${routes.adminClaims(testInfo)}?view=list`, testInfo, {
      marker: 'view-claim',
    });

    const viewButton = page.getByTestId('view-claim').first();
    await expect(viewButton).toBeVisible();
    await viewButton.click({ force: true });
    await expect(page).toHaveURL(/\/admin\/claims\/[\w-]+/);

    const docsPanel = page.getByTestId('ops-documents-panel');
    await expect(docsPanel).toBeVisible({ timeout: 10000 });

    const timeline = page.getByTestId('ops-timeline');
    await expect(timeline).toBeVisible();
    const timelineItems = timeline.getByTestId('ops-timeline-item');
    if ((await timelineItems.count()) === 0) {
      await expect(timeline.getByTestId('ops-timeline-empty')).toBeVisible();
    } else {
      await expect(timelineItems.first()).toBeVisible();
    }

    const actionBar = page.getByTestId('ops-action-bar');
    if ((await actionBar.count()) > 0) {
      await expect(actionBar.first()).toBeVisible();
    }
  });
});
