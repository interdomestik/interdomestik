/**
 * Operational Center (Phase 2.7) Smoke Tests
 * Optimized for speed and reliability using storage state.
 */
import { expect, test } from '@playwright/test';
import path from 'path';

const DEFAULT_LOCALE = 'sq';
const ADMIN_MK_STATE = path.join(__dirname, '.auth', 'mk', 'admin.json');

test.describe('Ops Center Dashboard (Phase 2.7) ', () => {
  // Inject storage state for all tests in this block
  test.use({ storageState: ADMIN_MK_STATE });

  test.beforeEach(async ({ page }) => {
    // Navigate directly to the Ops Center
    await page.goto(`/${DEFAULT_LOCALE}/admin/claims`);

    // Use .first() to handle occasional hydration twin-nodes in mobile-chrome
    const opsPage = page.getByTestId('ops-center-page').first();
    const errorBoundary = page.getByTestId('error-boundary').first();

    try {
      await expect(opsPage.or(errorBoundary)).toBeVisible({ timeout: 20000 });
    } catch (e) {
      if (!(await page.getByTestId('ops-center-page').first().isVisible())) {
        throw e;
      }
    }

    if (await errorBoundary.isVisible()) {
      const errorText = await errorBoundary.innerText();
      throw new Error(`Ops Center Crashed: ${errorText}`);
    }
  });

  test('1. KPI Header is visible', async ({ page }) => {
    await expect(page.getByTestId('kpi-header').first()).toBeVisible();
    await expect(page.getByTestId('kpi-total-open').first()).toBeVisible();
  });

  test('2. Prioritized List has content or empty state', async ({ page }) => {
    await expect(page.getByTestId('work-center').first()).toBeVisible();

    await expect
      .poll(
        async () => {
          const hasCards = (await page.getByTestId('claim-operational-card').count()) > 0;
          const hasEmpty = await page.getByText(/Nuk ka kërkesa|Nuk ka rezultate/i).isVisible();
          return hasCards || hasEmpty;
        },
        { timeout: 10000 }
      )
      .toBeTruthy();
  });

  test('3. Refresh button resets page', async ({ page }) => {
    // Navigate to a sub-state (page 2)
    await page.goto(`/${DEFAULT_LOCALE}/admin/claims?page=2`);
    await expect(page).toHaveURL(/page=2/);

    const refreshBtn = page.getByTestId('refresh-button').first();
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click({ force: true });

    // URL should reset (params cleared)
    await expect(page).not.toHaveURL(/page=2/);
  });

  test('4. Large Layout (1440x900)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('kpi-header').first()).toBeVisible();
    await expect(page.getByTestId('queue-sidebar').first()).toBeVisible();
  });
});
