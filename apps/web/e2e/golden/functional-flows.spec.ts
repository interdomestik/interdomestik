import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { expect, test, TestInfo } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT-AWARE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

type Tenant = 'ks' | 'mk';

function getTenantFromTestInfo(testInfo: TestInfo): Tenant {
  return testInfo.project.name.includes('mk') ? 'mk' : 'ks';
}

function isKsProject(testInfo: TestInfo): boolean {
  return getTenantFromTestInfo(testInfo) === 'ks';
}

const DEFAULT_LOCALE = 'sq';

// Canonical users - tenant-aware
const USERS = {
  TENANT_ADMIN_KS: { email: E2E_USERS.KS_ADMIN.email, password: E2E_PASSWORD, tenant: 'tenant_ks' },
  STAFF_MK: { email: E2E_USERS.MK_STAFF.email, password: E2E_PASSWORD, tenant: 'tenant_mk' },
  STAFF_KS: { email: E2E_USERS.KS_STAFF.email, password: E2E_PASSWORD, tenant: 'tenant_ks' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function loginAs(
  page: import('@playwright/test').Page,
  user: { email: string; password: string; tenant: string }
) {
  await page.goto(`/${DEFAULT_LOCALE}/login?tenantId=${user.tenant}`);
  await page.getByTestId('login-form').waitFor({ state: 'visible' });
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();

  // Wait for navigation away from login
  await page.waitForURL(/(?:member|admin|staff|agent|dashboard)/, { timeout: 30000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTIONAL GOLDEN FLOWS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Golden Flows: Functional Depth', () => {
  test.describe('5. Security & Isolation ', () => {
    test('KS Admin cannot see MK Leads', async ({ page }) => {
      await loginAs(page, USERS.TENANT_ADMIN_KS);
      await page.goto(`/${DEFAULT_LOCALE}/admin/leads`);
      await expect(page.getByText('Balkan Lead')).not.toBeVisible();
    });

    test('Staff forbidden from Agent Onboarding', async ({ page }, testInfo) => {
      // Use tenant-aware staff selection
      const staff = isKsProject(testInfo) ? USERS.STAFF_KS : USERS.STAFF_MK;
      await loginAs(page, staff);
      await page.goto(`/${DEFAULT_LOCALE}/agent/leads`);
      // Should redirect or show 403
      // Should see 404 (Strict Isolation)
      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });

    // REPLACED: Original KS A/B tests with KS PACK TESTS
    test('KS Pack Verification: Branch Codes and Health Statuses', async ({ page }) => {
      await loginAs(page, USERS.TENANT_ADMIN_KS);
      await page.goto(`/${DEFAULT_LOCALE}/admin/branches`);
      await page.waitForLoadState('networkidle');

      // Assert Branch Codes Visible (Pack deliverables)
      await expect(page.getByText('KS-A')).toBeVisible();
      await expect(page.getByText('KS-B')).toBeVisible();
      await expect(page.getByText('KS-C')).toBeVisible();

      // Assert Health Status Labels (using translated text as requested)
      // KS-A (Urgent)
      await expect(
        page
          .locator('[data-testid="branch-card"]')
          .filter({ hasText: 'KS-A' })
          .getByText(/Urgjente|Urgent/i)
      ).toBeVisible();

      // KS-B (Attention)
      await expect(
        page
          .locator('[data-testid="branch-card"]')
          .filter({ hasText: 'KS-B' })
          .getByText(/Kërkon Vëmendje|Attention/i)
      ).toBeVisible();

      // KS-C (Healthy)
      await expect(
        page
          .locator('[data-testid="branch-card"]')
          .filter({ hasText: 'KS-C' })
          .getByText(/Gjendje e Shëndetshme|Healthy/i)
      ).toBeVisible();
    });

    test('KS-A Branch Dashboard shows urgent health score (0-39 range) and ops panels', async ({
      page,
    }) => {
      await loginAs(page, USERS.TENANT_ADMIN_KS);
      await page.goto(`/${DEFAULT_LOCALE}/admin/branches/KS-A`);

      await expect(page.locator('[data-testid="branch-dashboard-title"]')).toBeVisible({
        timeout: 15000,
      });

      // Assert Health Score
      const scoreElement = page.locator('[data-testid="health-score"]');
      await expect(scoreElement).toBeVisible();
      const scoreText = await scoreElement.textContent();
      const score = parseInt(scoreText?.trim() || '100');
      expect(score).toBeLessThanOrEqual(39);

      // Assert Operational Alerts
      await expect(page.locator('body')).toContainText(/Rrezik Shkelje SLA/i);
      await expect(page.locator('body')).toContainText(/Cash në Pritje/i);

      // KS PACK GUARDS
      // 1. Assert "Anëtarët totalë" is not "0"
      // 1. Assert "Anëtarët Totale" is not "0"
      const membersKpiValue = page
        .locator('span', { hasText: /^Anëtarët Totale$/ })
        .locator('xpath=following-sibling::span');
      await expect(membersKpiValue).toContainText(/[1-9]/); // Any non-zero digit

      // 2. Assert "Shëndeti i Agjentëve" table contains "Blerim Hoxha"
      await expect(page.getByText('Blerim Hoxha')).toBeVisible();

      // Assert Staff Load Panel shows non-zero count
      const staffLoadPanel = page.locator('body');
      await expect(staffLoadPanel).toContainText(/Ngarkesa e Stafit/i);

      const staffLoadTable = page.locator('table');
      await expect(staffLoadTable.getByText(/\d+/).first()).toBeVisible();
    });
  });
});
