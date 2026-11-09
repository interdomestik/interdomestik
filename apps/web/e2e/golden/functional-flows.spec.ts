import { expect, test } from '../fixtures/auth.fixture';
import { getTenantFromTestInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { TENANT_OPEN_CASH_LEAD_EMAIL } from '../utils/cash-states';

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTIONAL GOLDEN FLOWS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Golden Flows: Functional Depth', () => {
  test.describe('5. Security & Isolation ', () => {
    test('a tenant admin finds its own open cash request and not the other tenant one', async ({
      adminPage,
    }, testInfo) => {
      const own = getTenantFromTestInfo(testInfo) === 'mk' ? 'mk' : 'ks';
      const other = own === 'mk' ? 'ks' : 'mk';
      for (const [tenant, expected] of [
        [own, 1],
        [other, 0],
      ] as const) {
        const email = TENANT_OPEN_CASH_LEAD_EMAIL[tenant];
        const params = new URLSearchParams({ query: email });
        await gotoApp(adminPage, `${routes.adminLeads(testInfo)}?${params}`, testInfo, {
          marker: 'verification-ops-page',
        });
        await expect(adminPage.getByTestId('verification-search-pending')).toHaveCount(0);
        const rows = adminPage
          .getByTestId('cash-verification-row')
          .filter({ visible: true })
          .filter({ has: adminPage.getByText(email, { exact: true }) });
        await expect(rows, `${tenant} request seen by the ${own} admin`).toHaveCount(expected);
      }
    });

    test('staff is refused the agent portal that an agent opens', async ({
      agentPage,
      staffPage,
    }, testInfo) => {
      // Positive control first: the route exists and renders for its own role, so the staff 404
      // below comes from the portal gate and not from a wrong URL.
      await gotoApp(agentPage, routes.agentMembers(testInfo), testInfo, {
        marker: 'agent-page-ready',
      });
      await gotoApp(staffPage, routes.agentMembers(testInfo), testInfo, {
        marker: 'not-found-page',
      });
      await expect(staffPage.getByTestId('agent-page-ready')).toHaveCount(0);
    });

    test('KS Pack Verification: Branch Codes and Health Statuses', async ({
      adminPage,
    }, testInfo) => {
      // Skip on MK tenant as this checks specific KS seed data
      test.skip(testInfo.project.name.includes('mk'), 'KS-specific pack verification');

      await gotoApp(adminPage, routes.adminBranches(testInfo), testInfo, { marker: 'page-ready' });

      // The router keeps a hidden copy of a revisited page, so cards are read where visible.
      const card = (code: string) =>
        adminPage.getByTestId(`branch-card-${code}`).filter({ visible: true });
      for (const code of ['KS-A', 'KS-B', 'KS-C']) await expect(card(code)).toBeVisible();

      // Seeded claims are dated from the fixed E2E seed base (2026-01-01) while the SLA rule
      // compares with the wall clock, so every seeded `submitted` claim counts as an SLA breach:
      // KS-B has five (urgent), KS-C one (watch). KS-A is urgent on cash and claims alike.
      await expect(card('KS-A').getByText(/Urgjente|Urgent/i)).toBeVisible();
      await expect(card('KS-B').getByText(/Urgjente|Urgent/i)).toBeVisible();
      await expect(card('KS-C').getByText(/Kërkon Vëmendje|Attention/i)).toBeVisible();
    });

    test('KS-A Branch Dashboard shows urgent health score (0-39 range) and ops panels', async ({
      adminPage,
    }, testInfo) => {
      test.skip(testInfo.project.name.includes('mk'), 'KS-specific branch verification');

      await gotoApp(adminPage, `${routes.adminBranches(testInfo)}/KS-A`, testInfo, {
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
      await expect(adminPage.locator('body')).toContainText(/Pagesa me para në dorë në pritje/i);

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
