import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { assertAccessDenied } from '../utils/rbac';

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTIONAL GOLDEN FLOWS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Golden Flows: Functional Depth', () => {
  test.describe('5. Security & Isolation ', () => {
    test('KS Admin cannot see MK Leads', async ({ adminPage }, testInfo) => {
      // Use adminPage fixture which handles tenant-aware login
      await gotoApp(adminPage, l => `${routes.admin(l)}/leads`, testInfo, { marker: 'page-ready' });
      await expect(adminPage.getByText('Balkan Lead')).not.toBeVisible();
    });

    test('Staff forbidden from Agent Onboarding', async ({ staffPage }, testInfo) => {
      // Staff trying to access Agent route
      // Note: gotoApp will wait for page-ready. If 404/403 renders within layout, it works.
      await gotoApp(staffPage, l => `${routes.agent(l)}/leads`, testInfo, { marker: 'page-ready' });
      await assertAccessDenied(staffPage);
    });

    test('KS Pack Verification: Branch Codes and Health Statuses', async ({
      adminPage,
    }, testInfo) => {
      // Skip on MK tenant as this checks specific KS seed data
      test.skip(testInfo.project.name.includes('mk'), 'KS-specific pack verification');

      await gotoApp(adminPage, routes.adminBranches, testInfo, { marker: 'page-ready' });
      // await page.waitForLoadState('networkidle'); // Removed per policy

      // Assert Branch Codes Visible (Pack deliverables)
      await expect(adminPage.getByText('KS-A')).toBeVisible();
      await expect(adminPage.getByText('KS-B')).toBeVisible();
      await expect(adminPage.getByText('KS-C')).toBeVisible();

      // Assert Health Status Labels
      await expect(
        adminPage
          .locator('[data-testid="branch-card"]')
          .filter({ hasText: 'KS-A' })
          .getByText(/Urgjente|Urgent/i)
      ).toBeVisible();

      await expect(
        adminPage
          .locator('[data-testid="branch-card"]')
          .filter({ hasText: 'KS-B' })
          .getByText(/Kërkon Vëmendje|Attention/i)
      ).toBeVisible();

      await expect(
        adminPage
          .locator('[data-testid="branch-card"]')
          .filter({ hasText: 'KS-C' })
          .getByText(/Gjendje e Shëndetshme|Healthy/i)
      ).toBeVisible();
    });

    test('KS-A Branch Dashboard shows urgent health score (0-39 range) and ops panels', async ({
      adminPage,
    }, testInfo) => {
      test.skip(testInfo.project.name.includes('mk'), 'KS-specific branch verification');

      await gotoApp(adminPage, l => `${routes.adminBranches(l)}/KS-A`, testInfo, {
        marker: 'page-ready',
      });

      await expect(adminPage.locator('[data-testid="branch-dashboard-title"]')).toBeVisible({
        timeout: 15000,
      });

      // Assert Health Score
      const scoreElement = adminPage.locator('[data-testid="health-score"]');
      await expect(scoreElement).toBeVisible();
      const scoreText = await scoreElement.textContent();
      const score = parseInt(scoreText?.trim() || '100');
      expect(score).toBeLessThanOrEqual(39);

      // Assert Operational Alerts
      await expect(adminPage.locator('body')).toContainText(/Rrezik Shkelje SLA/i);
      await expect(adminPage.locator('body')).toContainText(/Cash në Pritje/i);

      // KS PACK GUARDS
      const membersKpiValue = adminPage
        .locator('span', { hasText: /^Anëtarët Totale$/ })
        .locator('xpath=following-sibling::span');
      await expect(membersKpiValue).toContainText(/[1-9]/);

      await expect(adminPage.getByText('Blerim Hoxha')).toBeVisible();

      const staffLoadPanel = adminPage.locator('body');
      await expect(staffLoadPanel).toContainText(/Ngarkesa e Stafit/i);

      const staffLoadTable = adminPage.locator('table');
      await expect(staffLoadTable.getByText(/\d+/).first()).toBeVisible();
    });
  });
});
