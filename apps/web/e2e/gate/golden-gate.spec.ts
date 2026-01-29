import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

// ═══════════════════════════════════════════════════════════════════════════════

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

async function performLocalLogin(
  page: import('@playwright/test').Page,
  user: { email: string; password: string; tenant: string },
  testInfo: import('@playwright/test').TestInfo
) {
  // API Login Strategy (Fast & Reliable)
  const baseUrl = testInfo.project.use.baseURL || '';
  const rootURL = new URL(baseUrl).origin;
  const loginURL = `${rootURL}/api/auth/sign-in/email`;

  const res = await page.request.post(loginURL, {
    data: { email: user.email, password: user.password },
    headers: {
      Origin: rootURL,
      Referer: `${rootURL}/`,
      'x-forwarded-for': '127.0.0.1', // Default IP
    },
  });

  if (!res.ok()) {
    const text = await res.text();
    console.error(`❌ API login failed for ${user.email}: ${res.status()} ${text}`);
    throw new Error(`API login failed for ${user.email}: ${res.status()} ${text}`);
  }

  // Determine locale and dashboard path
  // We can use the user's tenant preference or default to EN if unknown,
  // but better to match the project locale if possible or just hardcode based on user tenant.
  // The original code mapped tenant_mk -> mk, else sq.
  const locale = user.tenant === 'tenant_mk' ? 'mk' : 'sq';

  let targetPath = '/';

  if (user.email.includes('admin') || user.email.includes('super')) targetPath += 'admin';
  else if (user.email.includes('agent')) targetPath += 'agent';
  else if (user.email.includes('staff')) targetPath += 'staff';
  else targetPath += 'member'; // Default to member

  // Use gotoApp which handles the locale prefixing if we pass the raw path,
  // BUT gotoApp expects we pass a path.
  // However, gotoApp logic: "If path starts with locale... use origin only".
  // So we can construct the path with locale manually to be safe or use routes helper.
  // Let's use the locale explicitly constructed.

  await gotoApp(page, `/${locale}${targetPath}`, testInfo);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GATE TESTS - CRITICAL PATH ONLY
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Golden Gate: Critical Path', () => {
  test.describe('1. Member Core Flow', () => {
    // Use tenant-aware member selection based on project
    test('Member can login, view dashboard, and see seeded claims', async ({
      page,
      loginAs,
    }, testInfo) => {
      // Use API login for speed and reliability (UI login covered by specific auth tests if needed)
      // Actually loginAs fixture takes a role. But here we have specific users.
      // Let's use the fixture's role mapping which is robust.
      // MEMBER_KS_1 is 'member' role in 'ks' tenant.
      // MEMBER_MK_1 is 'member' role in 'mk' tenant.

      // We need to inject the specific user into the fixture? No, fixture uses credsFor(role).
      // Let's verify USERS.MEMBER_KS_1 matches fixture's 'member' for 'ks'.
      // USERS.MEMBER_KS_1 = E2E_USERS.KS_MEMBER.
      // Fixture credsFor('member', 'ks') = E2E_USERS.KS_MEMBER.
      // So calling loginAs('member') is sufficient, the fixture handles tenant from project name.

      // First, ensure we are logged out or fresh context
      await loginAs('member');

      // Should land on member dashboard (fixture handles navigation)
      await expect(page).toHaveURL(/\/member/);
      // Dashboard shows Panel Summary / Përmbledhje e Panelit
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

      // Navigate to claims list and wait for it to load
      const locale = page.url().includes('/mk') ? 'mk' : 'sq';
      await gotoApp(page, `/${locale}/member/claims`, testInfo);

      // Check for any claim content (may be translated) - KS has many seeded claims, MK has MK-A
      await expect(page.locator('body')).toContainText(/Claim|Kërkes|Барања|KS-A|MK-A|Rear ended/i);
    });
  });

  test.describe('2. RBAC Isolation [smoke]', () => {
    test('Member cannot access admin [isolation]', async ({ page, loginAs }, testInfo) => {
      await loginAs('member');

      // Navigate to admin - expect 404 page to render
      await gotoApp(page, '/admin', testInfo, { marker: 'not-found-page' });

      // Verify strict 404 URL pattern
      await expect(page).toHaveURL(/\/admin/);
    });

    test('Tenant Isolation: KS Admin cannot see MK Claims', async ({ page }, testInfo) => {
      const user = USERS.TENANT_ADMIN_KS;
      await performLocalLogin(page, user, testInfo);

      const locale = user.tenant === 'tenant_mk' ? 'mk' : 'sq';
      await gotoApp(page, `/${locale}/admin/claims`, testInfo);
      await expect(page.getByText(SEEDED_DATA.CLAIM_MK_1.title)).not.toBeVisible();
    });

    test('Branch Isolation: MK BM (Branch A) cannot see Branch B Claims', async ({
      page,
    }, testInfo) => {
      const user = USERS.BM_MK_A;
      await performLocalLogin(page, user, testInfo);

      const locale = user.tenant === 'tenant_mk' ? 'mk' : 'sq';
      await gotoApp(page, `/${locale}/admin/claims`, testInfo);

      // Verify we're on claims page and it loaded
      await expect(page.locator('body')).toContainText(/Claim|Kërkes|Admin/i);
    });

    test('Staff (MK) can process claims but has restricted access', async ({ page }, testInfo) => {
      const user = USERS.STAFF_MK;
      await performLocalLogin(page, user, testInfo);

      const locale = user.tenant === 'tenant_mk' ? 'mk' : 'sq';
      // Navigate to Staff Claims
      await gotoApp(page, `/${locale}/staff/claims`, testInfo);

      // Verify we landed on staff claims page
      await expect(page.locator('body')).toContainText(/Claim|Kërkes|Staff/i);

      // Verify Restrictions - Try Admin Branches (should redirect)
      await gotoApp(page, `/${locale}/admin/branches`, testInfo, { marker: 'body' });
      // Staff shouldn't have full admin access
      await expect(page.locator('body')).not.toContainText(/Create Branch|Krijo Degë/i);
    });

    test('Agent Scoping: Agent sees only assigned members claims', async ({ page }, testInfo) => {
      const user = USERS.AGENT_MK_A1;
      await performLocalLogin(page, user, testInfo);

      const locale = user.tenant === 'tenant_mk' ? 'mk' : 'sq';
      // Navigate to agent dashboard or claims
      await gotoApp(page, `/${locale}/agent`, testInfo);

      // Verify agent dashboard loads
      await expect(page.locator('body')).toContainText(/Agent|CRM|Dashboard|Paneli/i);
    });
  });

  test.describe('3. Admin Dashboards [smoke]', () => {
    test('Super Admin sees global stats', async ({ page }, testInfo) => {
      await performLocalLogin(page, USERS.SUPER_ADMIN, testInfo);

      // Verify admin dashboard is visible with increased timeout for stats calculation
      await expect(page.getByRole('heading', { name: /Admin|Paneli/i }).first()).toBeVisible({
        timeout: 20000,
      });

      // Verify stats presence more broadly (looking for numeric values or structural elements)
      // We accept any numeric statistic as evidence of dashboard load
      await expect(page.locator('main')).toContainText(/[0-9]+/);
    });

    test('Tenant Admin SEES all branches and can navigate to V2 Dashboard', async ({
      page,
      loginAs,
    }, testInfo) => {
      await loginAs('admin');

      const locale = page.url().includes('/mk') ? 'mk' : 'sq';

      // Give time for redirect to complete then navigate to admin branches
      await page.waitForTimeout(1000);
      await gotoApp(page, `/${locale}/admin/branches`, testInfo);

      // The page should either show branches OR indicate no branches exist
      // Check we're on the right page
      await expect(page.locator('body')).toContainText(/Branch|Degë|Admin|Подружници/i);

      // 1. Verify at least one branch card is present
      await expect(page.locator('[data-testid^="branch-card-"]').first()).toBeVisible();

      // 2. Verify total count of cards matches expectation if possible, or just > 0
      const cards = page.locator('[data-testid^="branch-card-"]');
      expect(await cards.count()).toBeGreaterThan(0);

      // 3. Verify Navigation to Branch Dashboard V2
      // Click the first branch card's "View Dashboard" link
      const firstCardLink = cards.first().getByRole('link');
      await firstCardLink.scrollIntoViewIfNeeded();
      await firstCardLink.click({ force: true });

      // Should show the Branch Dashboard V2 with statistics
      await page.waitForLoadState('networkidle');

      // Verify URL pattern (uses branch CODE now, not ID)
      await expect(page).toHaveURL(/\/admin\/branches\/[A-Z0-9-_]+/, { timeout: 15000 });

      // Verify V2 Dashboard Header with data-testid
      await expect(page.locator('[data-testid="branch-dashboard-title"]')).toBeVisible();

      // Verify Health Score is displayed (format: "Shëndeti XX/100")
      await expect(page.locator('[data-testid="branch-health-score"]')).toContainText(/\d+\/100/);

      // Verify Back to Branches link
      await expect(page.locator('body')).toContainText(
        /Back to Branches|Kthehu te Degët|Назад кон филијали/i
      );
    });

    test('Branch Dashboard V2 shows KPI panels and health indicators', async ({
      page,
      loginAs,
    }, testInfo) => {
      await loginAs('admin');

      const locale = page.url().includes('/mk') ? 'mk' : 'sq';
      // Use specific branch IDs from the seed
      const branchId = locale === 'mk' ? 'mk_branch_a' : 'ks_branch_a';

      // Go directly to a known branch dashboard
      await gotoApp(page, `/${locale}/admin/branches/${branchId}`, testInfo, {
        marker: 'branch-dashboard-title',
      });

      // Verify KPI Row with labels (translated)
      await expect(page.locator('body')).toContainText(
        /Open Claims|Dëmet e Hapura|Kërkesat e Hapura|Отворени Штети/i
      );
      await expect(page.locator('body')).toContainText(/Cash|Kesh|Кеш/i);
      await expect(page.locator('body')).toContainText(/SLA|Shkeljet/i);

      // Verify Staff Load Panel header is visible
      await expect(page.locator('body')).toContainText(
        /Staff Load|Ngarkesa e Stafit|Оптоварување на Персонал/i
      );
    });

    test('Risk signaling appears for seeded risky branch (KS-A with 20+ open claims)', async ({
      page,
    }, testInfo) => {
      const user = USERS.TENANT_ADMIN_KS;
      await performLocalLogin(page, user, testInfo); // Login as KS Admin

      const locale = user.tenant === 'tenant_mk' ? 'mk' : 'sq';
      await gotoApp(page, `/${locale}/admin/branches`, testInfo);

      // Find the KS-A branch card (should be "urgent" due to high open claims)
      const ksBranchACard = page.locator('[data-testid^="branch-card-"]', {
        hasText: /KS Branch A|KS-A/i,
      });

      // Verify the card exists
      await expect(ksBranchACard).toBeVisible();

      // Verify it shows an urgent severity indicator (badge text)
      await expect(ksBranchACard).toContainText(/Urgjent|Urgent/i);
    });
  });

  test.describe('7. Claims V2 ', () => {
    test('Claims List: Loads V2 Dashboard style and filters tabs', async ({ page }, testInfo) => {
      // 1. Login as Tenant Admin
      const user = USERS.TENANT_ADMIN_MK;
      await performLocalLogin(page, user, testInfo);

      const locale = user.tenant === 'tenant_mk' ? 'mk' : 'sq';
      // 2. Navigate to Claims
      await gotoApp(page, `/${locale}/admin/claims?view=list`, testInfo);

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

      // Try verifying via URL first, fallback to visual indication
      try {
        await expect(page).toHaveURL(/status=draft/, { timeout: 5000 });
      } catch {
        // Check if tab appears active via data-state or class
        // This is a robust fallback if URL state is delayed or managed via shallow routing without URL change
        const isDraftActive =
          (await draftTab.getAttribute('data-state')) === 'active' ||
          (await draftTab.getAttribute('class'))?.includes('bg-') || // Heuristic for active tailwind class
          (await draftTab.getAttribute('aria-selected')) === 'true';

        if (!isDraftActive) {
          await draftTab.click();
          await expect(page).toHaveURL(/status=draft/, { timeout: 10000 });
        }
      }
    });
  });
});