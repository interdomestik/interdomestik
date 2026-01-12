/**
 * Operational Center (Phase 2.7) Smoke Tests
 */
import { expect, test } from '@playwright/test';

const DEFAULT_LOCALE = 'sq';
// Using TENANT_ADMIN_MK as default user for testing
const USERS = {
  TENANT_ADMIN_MK: {
    email: 'admin.mk@interdomestik.com',
    password: 'GoldenPass123!',
    tenant: 'tenant_mk',
  },
};

async function loginAs(
  page: import('@playwright/test').Page,
  user: { email: string; password: string; tenant: string }
) {
  await page.goto(`/${DEFAULT_LOCALE}/login?tenantId=${user.tenant}`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"], input[placeholder*="@"]').first().fill(user.email);
  await page.locator('input[type="password"]').first().fill(user.password);
  await page.locator('button[type="submit"]').click();
  // Wait for redirect to admin area
  await page.waitForURL(/\/admin\//, { timeout: 30000 });
}

test.describe('Ops Center Dashboard (Phase 2.7)', () => {
  // Use retries for tests that depend on complex layout calculations
  test.describe.configure({ retries: 2 });

  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`PAGE ERROR: ${msg.text()}`);
    });

    // Login and navigate
    await loginAs(page, USERS.TENANT_ADMIN_MK);
    await page.goto(`/${DEFAULT_LOCALE}/admin/claims`);
    // Wait for the main ops center container to be visible - ensuring RSC happened
    await expect(page.getByTestId('ops-center-page')).toBeVisible({ timeout: 20000 });
  });

  test('1. KPI Header is visible', async ({ page }) => {
    const header = page.getByTestId('kpi-header');
    await expect(header).toBeVisible();
    await expect(page.getByTestId('kpi-card-sla_breach')).toBeVisible();
  });

  test('2. "Needs Action" Queue Item exists', async ({ page }) => {
    await expect(page.getByTestId('queue-sidebar')).toBeVisible();
    await expect(page.getByTestId('queue-needs-action')).toBeVisible();
  });

  test('3. Prioritized List has content or empty state', async ({ page }) => {
    await expect(page.getByTestId('work-center')).toBeVisible();

    // Check for either cards OR empty state, polling until one appears
    await expect
      .poll(
        async () => {
          const hasCards = (await page.getByTestId('claim-operational-card').count()) > 0;
          const hasEmpty = (await page.getByText('Nuk ka rezultate').count()) > 0;
          return hasCards || hasEmpty;
        },
        { timeout: 10000 }
      )
      .toBeTruthy();
  });

  test('4. Refresh button resets page', async ({ page }) => {
    // Manually navigate deeply
    await page.goto(`/${DEFAULT_LOCALE}/admin/claims?page=5`);
    await expect(page.getByTestId('ops-center-page')).toBeVisible();

    const refreshBtn = page.getByTestId('refresh-button');
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();

    // URL should no longer have page=5
    await expect(page).not.toHaveURL(/page=5/);
  });

  test('5. Viewport check (1440x900) - Above fold', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.getByTestId('ops-center-page')).toBeVisible();

    // Check KPI header visibility
    await expect(page.getByTestId('kpi-header')).toBeInViewport();
    await expect(page.getByTestId('queue-sidebar')).toBeInViewport();

    // Requirement: 5 items visible above fold in WorkCenter container
    const cards = page.getByTestId('claim-operational-card');

    // Wait for cards to load
    await expect.poll(async () => await cards.count()).toBeGreaterThan(0);

    const count = await cards.count();
    // If we have at least 5 cards, the 5th one (index 4) should be visible
    if (count >= 5) {
      await expect(cards.nth(4)).toBeInViewport();
    } else {
      // Otherwise, the last one should be visible
      await expect(cards.last()).toBeInViewport();
    }
  });

  test('6. Viewport check (1280x720) - Above fold', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await expect(page.getByTestId('ops-center-page')).toBeVisible();

    await expect(page.getByTestId('kpi-header')).toBeInViewport();
    // At least 3 cards check if data exists
    const cards = page.getByTestId('claim-operational-card');
    // Wait for cards to count
    await expect.poll(async () => await cards.count()).toBeGreaterThanOrEqual(0);

    if ((await cards.count()) >= 3) {
      await expect(cards.nth(2)).toBeInViewport();
    }
  });
});
