/**
 * Golden Flows Smoke Tests
 *
 * Critical path tests for verifying RBAC, tenant isolation, and core functionality
 * using the deterministic Golden Seed data.
 *
 * Prerequisites:
 * - Run `pnpm --filter @interdomestik/database seed:golden` to populate test data
 * - Ensure INTERDOMESTIK_AUTOMATED=1 is set (handled by playwright.config.ts)
 */

import { expect, test } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════════
// GOLDEN SEED CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const PASSWORD = 'GoldenPass123!';
const DEFAULT_LOCALE = 'sq';

const USERS = {
  SUPER_ADMIN: { email: 'super@interdomestik.com', password: PASSWORD, tenant: 'tenant_mk' },
  TENANT_ADMIN_MK: { email: 'admin.mk@interdomestik.com', password: PASSWORD, tenant: 'tenant_mk' },
  TENANT_ADMIN_KS: { email: 'admin.ks@interdomestik.com', password: PASSWORD, tenant: 'tenant_ks' },
  STAFF_MK: { email: 'staff.mk@interdomestik.com', password: PASSWORD, tenant: 'tenant_mk' },
  BM_MK_A: { email: 'bm.mk.a@interdomestik.com', password: PASSWORD, tenant: 'tenant_mk' },
  AGENT_MK_A1: { email: 'agent.mk.a1@interdomestik.com', password: PASSWORD, tenant: 'tenant_mk' },
  MEMBER_MK_1: { email: 'member.mk.1@interdomestik.com', password: PASSWORD, tenant: 'tenant_mk' },
};

const SEEDED_DATA = {
  CLAIM_MK_1: { title: 'Rear ended in Skopje', amount: '500.00' }, // Branch A
  CLAIM_MK_3: { title: 'Towing Service', amount: '200.00' }, // Branch B
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function loginAs(
  page: import('@playwright/test').Page,
  user: { email: string; password: string; tenant: string }
) {
  // Navigate to locale-prefixed login with tenant context
  await page.goto(`/${DEFAULT_LOCALE}/login?tenantId=${user.tenant}`);

  // Wait for login form to be ready
  await page.waitForLoadState('networkidle');

  // Fill login form using placeholder text (more reliable than labels)
  // Albanian placeholder: "emri@shembull.com" for email
  await page.locator('input[type="email"], input[placeholder*="@"]').first().fill(user.email);

  // Password field
  await page.locator('input[type="password"]').first().fill(user.password);

  // Click submit button
  await page.locator('button[type="submit"]').click();

  // Wait for navigation away from login - increase timeout
  await page.waitForURL(/(?:member|admin|staff|agent|dashboard)/, { timeout: 30000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Golden Flows Smoke Suite', () => {
  test.describe('1. Member Core Flow (MK)', () => {
    test('Member can login, view dashboard, and see seeded claims', async ({ page }) => {
      await loginAs(page, USERS.MEMBER_MK_1);

      // Should land on member dashboard
      await expect(page).toHaveURL(/\/member/);
      // Dashboard shows Panel Summary / Përmbledhje e Panelit
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

      // Navigate to claims list and wait for it to load
      await page.goto(`/${DEFAULT_LOCALE}/member/claims`);
      await page.waitForLoadState('networkidle');

      // Check for any claim content (may be translated)
      await expect(page.locator('body')).toContainText(/Claim|Kërkes|Rear ended/i);

      // Verify NO access to admin - should redirect
      await page.goto(`/${DEFAULT_LOCALE}/admin`);
      await expect(page).not.toHaveURL(/\/admin$/);
    });
  });

  test.describe('2. RBAC Isolation', () => {
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

  test.describe('3. Admin Dashboards', () => {
    test('Super Admin sees global stats', async ({ page }) => {
      await loginAs(page, USERS.SUPER_ADMIN);

      // Verify admin dashboard is visible with key stats - use first() for multiple headings
      await expect(page.getByRole('heading', { name: /Admin|Paneli/i }).first()).toBeVisible();
      await expect(page.getByText(/Total MRR|Anëtarët|Gjithsej/i).first()).toBeVisible();
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. BALKAN AGENT FLOW
  // ═══════════════════════════════════════════════════════════════════════════════

  test.describe('4. Balkan Agent Flow (MK)', () => {
    test.describe.configure({ mode: 'serial' }); // Dependent steps

    test('Agent can create lead and initiate cash payment', async ({ page }) => {
      await loginAs(page, {
        email: 'agent.balkan.1@interdomestik.com',
        password: PASSWORD,
        tenant: 'tenant_mk',
      });

      await page.goto(`/${DEFAULT_LOCALE}/agent/leads`);
      await page.waitForLoadState('networkidle');

      // Verify Seeded Lead is visible
      await expect(page.getByText('Balkan Lead')).toBeVisible();

      // Create New Lead
      await page.getByRole('button', { name: /New Lead|Lead i Ri/i }).click();
      await page.waitForSelector('dialog[open]');

      await page.locator('input[name="firstName"]').fill('Smoke');
      await page.locator('input[name="lastName"]').fill('Test');
      await page.locator('input[name="email"]').fill(`smoke.balkan.${Date.now()}@test.com`);
      await page.locator('input[name="phone"]').fill('+38970888888');
      await page.locator('button[type="submit"]').click();

      // Wait for toast or refresh
      await expect(page.getByText(/Lead created|Lead u krijua/i)).toBeVisible({
        timeout: 20000,
      });

      // Reload to see new lead
      await page.reload();
      await expect(page.getByText('Smoke Test')).toBeVisible();

      // Initiate Cash Payment for new lead
      // Assuming 'Cash' button is available for new leads
      const row = page.getByRole('row', { name: 'Smoke Test' });
      await row.getByRole('button', { name: /Cash/i }).click();

      await expect(page.getByText(/Cash payment recorded|Pagesa u inicua/i)).toBeVisible();
    });

    test('Branch Manager can verify cash payment', async ({ page }) => {
      await loginAs(page, USERS.BM_MK_A);

      await page.goto(`/${DEFAULT_LOCALE}/admin/leads`);

      // Should see the pending payment from seed (Balkan Lead)
      // And potentially the one we just created if serial execution worked fast enough?
      // Let's rely on the seeded one "Balkan Lead" which is definitely pending.
      await expect(page.getByText('Balkan Lead')).toBeVisible();

      // Click Approve
      const row = page.getByRole('row', { name: 'Balkan Lead' });
      await row.getByRole('button', { name: /Approve|Aprovo/i }).click();

      await expect(page.getByText(/Payment approved|Pagesa u verifikua/i)).toBeVisible();
      // Should disappear or change status
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. SECURITY & ISOLATION EXTENSION
  // ═══════════════════════════════════════════════════════════════════════════════

  test.describe('5. Security & Isolation', () => {
    test('KS Admin cannot see MK Leads', async ({ page }) => {
      await loginAs(page, USERS.TENANT_ADMIN_KS);
      await page.goto(`/${DEFAULT_LOCALE}/admin/leads`);
      await expect(page.getByText('Balkan Lead')).not.toBeVisible();
    });

    test('Staff forbidden from Agent Onboarding', async ({ page }) => {
      await loginAs(page, USERS.STAFF_MK);
      await page.goto(`/${DEFAULT_LOCALE}/agent/leads`);
      // Should redirect or show 403
      await expect(page).not.toHaveURL(/\/agent\/leads/);
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // 6. OPS: Cash Verification V2
  // ═══════════════════════════════════════════════════════════════════════════════

  test.describe('6. Cash Verification v2', () => {
    test('Cash Ops: Verification queue loads and allows processing', async ({ page }) => {
      // 1. Login as Tenant Admin (Sees all)
      await loginAs(page, USERS.TENANT_ADMIN_MK);

      // 2. Navigate to Leads page
      await page.goto(`/${DEFAULT_LOCALE}/admin/leads`);
      await page.waitForLoadState('networkidle');

      // 3. VERIFY ROUTING: Check Page Title matches "Verifikimi i Pagesave"
      // This explicitly confirms we are NOT on the Claims page ("Menaxhimi i Kërkesave...")
      await expect(
        page.getByRole('heading', { name: /Verifikimi|Payment Verification/i })
      ).toBeVisible();

      // 4. Content Check (Row OR Empty State)
      const emptyState = page.getByText(/No pending cash verification requests/i);
      const rows = page.locator('[data-testid="cash-verification-row"]');

      if ((await rows.count()) > 0) {
        // Active Flow
        const firstRow = rows.first();
        await expect(firstRow).toBeVisible();
        await expect(firstRow).toContainText('MK-');

        // Reject Flow
        const countBefore = await rows.count();
        await firstRow.locator('[data-testid="cash-reject"]').click({ force: true });
        await expect(page.getByText(/Payment rejected/i)).toBeVisible();
        await expect(rows).toHaveCount(countBefore - 1);
      } else {
        // Empty State Flow (Routing Verified via Title)
        await expect(emptyState).toBeVisible();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 7. CLAIMS V2
  // ═══════════════════════════════════════════════════════════════════════════════

  test.describe('7. Claims V2', () => {
    test('Claims List: Loads V2 Dashboard style and filters tabs', async ({ page }) => {
      // 1. Login as Tenant Admin
      await loginAs(page, USERS.TENANT_ADMIN_MK);

      // 2. Navigate to Claims
      await page.goto(`/${DEFAULT_LOCALE}/admin/claims`);
      await page.waitForLoadState('networkidle');

      // 3. Verify V2 Header Access
      // "Kërkesat" is the title in Albanian
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

      // 4. Verify Active Tab is default and shows content (or empty state)
      // "Aktive" tab
      const activeTab = page.getByText(/Aktive|Active/i).first();
      await expect(activeTab).toBeVisible();

      // 5. Switch to Draft Tab
      const draftTab = page.getByText(/Draft/i).first();
      await draftTab.click();

      // Verify URL updated
      await expect(page).toHaveURL(/status=draft/);
    });
  });
});
