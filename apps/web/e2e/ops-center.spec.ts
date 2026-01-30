/**
 * Operational Center (Phase 2.7) Smoke Tests
 * Optimized for speed and reliability using storage state.
 */
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Ops Center Dashboard (Phase 2.7) ', () => {
  test.beforeEach(async ({ adminPage: page }, testInfo) => {
    await gotoApp(page, routes.adminClaims(testInfo), testInfo, { marker: 'ops-center-page' });

    // Use .first() to handle occasional hydration twin-nodes in mobile-chrome
    const opsPage = page.getByTestId('ops-center-page').first();
    const errorBoundary = page.getByTestId('error-boundary').first();

    await expect(opsPage.or(errorBoundary)).toBeVisible({ timeout: 20000 });

    if (await errorBoundary.isVisible()) {
      const errorText = await errorBoundary.innerText();
      throw new Error(`Ops Center Crashed: ${errorText}`);
    }
  });

  test('1. KPI Header is visible', async ({ adminPage: page }) => {
    await expect(page.getByTestId('kpi-header').first()).toBeVisible();
    await expect(page.getByTestId('kpi-total-open').first()).toBeVisible();
  });

  test('2. Prioritized List has content or empty state', async ({ adminPage: page }) => {
    await expect(page.getByTestId('work-center').first()).toBeVisible();

    await expect
      .poll(
        async () => {
          const hasCards = (await page.getByTestId('claim-operational-card').count()) > 0;
          const hasEmpty = await page.getByTestId('ops-empty-state').isVisible();
          return hasCards || hasEmpty;
        },
        { timeout: 10000 }
      )
      .toBeTruthy();
  });

  test('3. Refresh button resets page', async ({ adminPage: page }, testInfo) => {
    // Navigate to a sub-state (page 2)
    await gotoApp(page, `${routes.adminClaims(testInfo)}?page=2`, testInfo, {
      marker: 'ops-center-page',
    });
    await expect(page).toHaveURL(/page=2/);

    const refreshBtn = page.getByTestId('refresh-button').first();
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click({ force: true });

    // URL should reset (params cleared)
    await expect(page).not.toHaveURL(/page=2/);
  });

  test('4. Large Layout (1440x900)', async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('kpi-header').first()).toBeVisible();
    await expect(page.getByTestId('queue-sidebar').first()).toBeVisible();
  });
});
