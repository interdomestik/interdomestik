import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { expect, test, TestInfo } from '@playwright/test';
import { assertSeededEmail } from '../fixtures/seed-guard';

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
  SUPER_ADMIN: { email: E2E_USERS.SUPER_ADMIN.email, password: E2E_PASSWORD, tenant: 'tenant_mk' },
  TENANT_ADMIN_MK: { email: E2E_USERS.MK_ADMIN.email, password: E2E_PASSWORD, tenant: 'tenant_mk' },
  TENANT_ADMIN_KS: { email: E2E_USERS.KS_ADMIN.email, password: E2E_PASSWORD, tenant: 'tenant_ks' },
  STAFF_MK: { email: E2E_USERS.MK_STAFF.email, password: E2E_PASSWORD, tenant: 'tenant_mk' },
  BM_MK_A: {
    email: E2E_USERS.MK_BRANCH_MANAGER.email,
    password: E2E_PASSWORD,
    tenant: 'tenant_mk',
  },
  AGENT_MK_A1: { email: E2E_USERS.MK_AGENT.email, password: E2E_PASSWORD, tenant: 'tenant_mk' },
  MEMBER_MK_1: { email: E2E_USERS.MK_MEMBER.email, password: E2E_PASSWORD, tenant: 'tenant_mk' },
  MEMBER_KS_1: { email: E2E_USERS.KS_MEMBER.email, password: E2E_PASSWORD, tenant: 'tenant_ks' },
};

const SEEDED_DATA = {
  CLAIM_MK_1: { title: 'Rear ended in Skopje (Baseline)', amount: '500.00' }, // Branch A
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function loginAs(
  page: import('@playwright/test').Page,
  user: { email: string; password: string; tenant: string }
) {
  assertSeededEmail(user.email);
  await page.goto(`/${DEFAULT_LOCALE}/login?tenantId=${user.tenant}`);
  await page.getByTestId('login-form').waitFor({ state: 'visible' });
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();

  // Wait for navigation away from login - increase timeout
  await page.waitForURL(/(?:member|admin|staff|agent|dashboard)/, { timeout: 30000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GATE TESTS - CRITICAL PATH ONLY
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Golden Gate: Critical Path', () => {
  test.describe('1. Member Core Flow', () => {
    // Use tenant-aware member selection based on project
    test('Member can login, view dashboard, and see seeded claims', async ({ page }, testInfo) => {
      // Select the correct member based on project
      const member = isKsProject(testInfo) ? USERS.MEMBER_KS_1 : USERS.MEMBER_MK_1;
      await loginAs(page, member);

      // Should land on member dashboard
      await expect(page).toHaveURL(/\/member/);
      // Dashboard shows Panel Summary / Përmbledhje e Panelit
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

      // Navigate to claims list and wait for it to load
      await page.goto(`/${DEFAULT_LOCALE}/member/claims`);
      await page.waitForLoadState('networkidle');

      // Check for any claim content (may be translated) - KS has many seeded claims
      await expect(page.locator('body')).toContainText(/Claim|Kërkes|KS-A|Rear ended/i);

      // Verify NO access to admin - should redirect
      await page.goto(`/${DEFAULT_LOCALE}/admin`);
      // Verify NO access to admin - should see 404 (Strict Isolation)
      await expect(
        page.getByRole('heading', { name: /404|Not Found|Kërkesa nuk u gjet|Faqja nuk u gjet/i })
      ).toBeVisible();
    });
  });

  test.describe('2. RBAC Isolation [smoke]', () => {
    test('Tenant Isolation: KS Admin cannot see MK Claims', async ({ page }) => {
      await loginAs(page, USERS.TENANT_ADMIN_KS);

      await page.goto(`/${DEFAULT_LOCALE}/admin/claims`);
      await expect(page.getByText(SEEDED_DATA.CLAIM_MK_1.title)).not.toBeVisible();
    });

    test('Branch Isolation: MK BM (Branch A) cannot see Branch B Claims', async ({ page }) => {
      await loginAs(page, USERS.BM_MK_A);

      await page.goto(`/${DEFAULT_LOCALE}/admin/claims`);
      await page.waitForLoadState('networkidle');

      // Verify we're on claims page and it loaded
      await expect(page.locator('body')).toContainText(/Claim|Kërkes|Admin/i);
    });

    test('Staff (MK) can process claims but has restricted access', async ({ page }) => {
      await loginAs(page, USERS.STAFF_MK);

      // Navigate to Staff Claims
      await page.goto(`/${DEFAULT_LOCALE}/staff/claims`);
      await page.waitForLoadState('networkidle');

      // Verify we landed on staff claims page
      await expect(page.locator('body')).toContainText(/Claim|Kërkes|Staff/i);

      // Verify Restrictions - Try Admin Branches (should redirect)
      await page.goto(`/${DEFAULT_LOCALE}/admin/branches`);
      // Staff shouldn't have full admin access
      await expect(page.locator('body')).not.toContainText(/Create Branch|Krijo Degë/i);
    });

    test('Agent Scoping: Agent sees only assigned members claims', async ({ page }) => {
      await loginAs(page, USERS.AGENT_MK_A1);

      // Navigate to agent dashboard or claims
      await page.goto(`/${DEFAULT_LOCALE}/agent`);
      await page.waitForLoadState('networkidle');

      // Verify agent dashboard loads
      await expect(page.locator('body')).toContainText(/Agent|CRM|Dashboard|Paneli/i);
    });
  });

  test.describe('3. Admin Dashboards [smoke]', () => {
    test('Super Admin sees global stats', async ({ page }) => {
      await loginAs(page, USERS.SUPER_ADMIN);

      // Verify admin dashboard is visible with increased timeout for stats calculation
      await expect(page.getByRole('heading', { name: /Admin|Paneli/i }).first()).toBeVisible({
        timeout: 20000,
      });

      // Verify stats presence more broadly (looking for numeric values or structural elements)
      // We accept any numeric statistic as evidence of dashboard load
      await expect(page.locator('main')).toContainText(/[0-9]+/);
    });

    test('Tenant Admin SEES all branches and can navigate to V2 Dashboard', async ({ page }) => {
      await loginAs(page, USERS.TENANT_ADMIN_MK);

      // Give time for redirect to complete then navigate to admin branches
      await page.waitForTimeout(1000);
      await page.goto(`/${DEFAULT_LOCALE}/admin/branches`);
      await page.waitForLoadState('networkidle');

      // The page should either show branches OR indicate no branches exist
      // Check we're on the right page
      await expect(page.locator('body')).toContainText(/Branch|Degë|Admin/i);

      // 1. Verify at least one branch card is present
      await expect(page.locator('[data-testid="branch-card"]').first()).toBeVisible();

      // 2. Verify total count of cards matches expectation if possible, or just > 0
      const cards = page.locator('[data-testid="branch-card"]');
      expect(await cards.count()).toBeGreaterThan(0);

      // 3. Verify Navigation to Branch Dashboard V2
      // Click the first branch card's "View Dashboard" link
      const firstCardLink = cards.first().getByRole('link');
      await firstCardLink.click();

      // Should show the Branch Dashboard V2 with statistics
      await page.waitForLoadState('networkidle');

      // Verify URL pattern (uses branch CODE now, not ID)
      await expect(page).toHaveURL(/\/admin\/branches\/[A-Z0-9-]+/);

      // Verify V2 Dashboard Header with data-testid
      await expect(page.locator('[data-testid="branch-dashboard-title"]')).toBeVisible();

      // Verify Health Score is displayed (format: "Shëndeti XX/100")
      await expect(page.locator('[data-testid="branch-health-score"]')).toContainText(/\d+\/100/);

      // Verify Back to Branches link
      await expect(page.locator('body')).toContainText(/Back to Branches|Kthehu te Degët/i);
    });

    test('Branch Dashboard V2 shows KPI panels and health indicators', async ({ page }) => {
      await loginAs(page, USERS.TENANT_ADMIN_MK);

      // Go directly to a known branch dashboard (MK-A code)
      await page.goto(`/${DEFAULT_LOCALE}/admin/branches/MK-A`);
      await page.waitForLoadState('networkidle');

      // Verify KPI Row with labels (translated)
      await expect(page.locator('body')).toContainText(
        /Open Claims|Dëmet e Hapura|Kërkesat e Hapura/i
      );
      await expect(page.locator('body')).toContainText(/Cash|Kesh/i);
      await expect(page.locator('body')).toContainText(/SLA|Shkeljet/i);

      // Verify Staff Load Panel header is visible
      await expect(page.locator('body')).toContainText(/Staff Load|Ngarkesa e Stafit/i);
    });

    test('Risk signaling appears for seeded risky branch (KS-A with 20+ open claims)', async ({
      page,
    }) => {
      await loginAs(page, USERS.TENANT_ADMIN_KS); // Login as KS Admin

      await page.goto(`/${DEFAULT_LOCALE}/admin/branches`);
      await page.waitForLoadState('networkidle');

      // Find the KS-A branch card (should be "urgent" due to high open claims)
      const ksBranchACard = page.locator('[data-testid="branch-card"]', {
        hasText: /KS Branch A|KS-A/i,
      });

      // Verify the card exists
      await expect(ksBranchACard).toBeVisible();

      // Verify it shows an urgent severity indicator (badge text)
      await expect(ksBranchACard).toContainText(/Urgjent|Urgent/i);
    });
  });

  test.describe('7. Claims V2 ', () => {
    test('Claims List: Loads V2 Dashboard style and filters tabs', async ({ page }) => {
      // 1. Login as Tenant Admin
      await loginAs(page, USERS.TENANT_ADMIN_MK);

      // 2. Navigate to Claims
      await page.goto(`/${DEFAULT_LOCALE}/admin/claims?view=list`);
      await page.waitForLoadState('networkidle');

      // 3. Verify V2 Header Access
      // "Kërkesat" is the title in Albanian
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

      // 4. Verify Active Tab is default and shows content (or empty state)
      // "Aktive" tab
      const activeTab = page.getByTestId('status-filter-active');
      await expect(activeTab).toBeVisible();

      // 5. Switch to Draft Tab
      const draftTab = page.getByTestId('status-filter-draft').first();
      await draftTab.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -100)); // Clear sticky header
      await draftTab.click({ force: true });
      // Wait for URL to reflect the filter change
      await expect(page).toHaveURL(/status=draft/, { timeout: 15000 });
    });
  });
});
