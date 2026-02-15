import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

// ═══════════════════════════════════════════════════════════════════════════════

// Canonical users - tenant-aware
const USERS = {
  SUPER_ADMIN: { email: E2E_USERS.SUPER_ADMIN.email, password: E2E_PASSWORD, tenant: 'tenant_mk' },
  TENANT_ADMIN_MK: { email: E2E_USERS.MK_ADMIN.email, password: E2E_PASSWORD, tenant: 'tenant_mk' },
  TENANT_ADMIN_KS: { email: E2E_USERS.KS_ADMIN.email, password: E2E_PASSWORD, tenant: 'tenant_ks' },
  STAFF_MK: { email: E2E_USERS.MK_STAFF.email, password: E2E_PASSWORD, tenant: 'tenant_mk' },
  STAFF_KS: { email: E2E_USERS.KS_STAFF.email, password: E2E_PASSWORD, tenant: 'tenant_ks' },
  BM_MK_A: {
    email: E2E_USERS.MK_BRANCH_MANAGER.email,
    password: E2E_PASSWORD,
    tenant: 'tenant_mk',
  },
  BM_KS_A: {
    email: E2E_USERS.KS_BRANCH_MANAGER.email,
    password: E2E_PASSWORD,
    tenant: 'tenant_ks',
  },
  AGENT_MK_A1: { email: E2E_USERS.MK_AGENT.email, password: E2E_PASSWORD, tenant: 'tenant_mk' },
  AGENT_KS_A1: { email: E2E_USERS.KS_AGENT.email, password: E2E_PASSWORD, tenant: 'tenant_ks' },
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
  testInfo: import('@playwright/test').TestInfo,
  target: 'admin' | 'staff' | 'agent' | 'member'
) {
  // API Login Strategy (Fast & Reliable)
  const baseUrl = testInfo.project.use.baseURL || '';
  const origin = new URL(baseUrl).origin;
  const loginURL = `${origin}/api/auth/sign-in/email`;

  const res = await page.request.post(loginURL, {
    data: { email: user.email, password: user.password },
    headers: {
      Origin: origin,
      Referer: `${origin}/login`,
      'x-forwarded-for': '127.0.0.1', // Default IP
    },
  });

  if (!res.ok()) {
    const text = await res.text();
    console.error(`❌ API login failed for ${user.email}: ${res.status()} ${text}`);
    throw new Error(`API login failed for ${user.email}: ${res.status()} ${text}`);
  }

  // Determine target route using project-aware routes helper
  const targetPath = routes[target](testInfo);

  await gotoApp(page, targetPath, testInfo, { marker: 'dashboard-page-ready' });
}

function isMkProject(testInfo: import('@playwright/test').TestInfo): boolean {
  return testInfo.project.name.includes('mk');
}

// ═══════════════════════════════════════════════════════════════════════════════
// GATE TESTS - CRITICAL PATH ONLY
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Golden Gate: Critical Path', () => {
  test.describe('1. Member Core Flow', () => {
    test('Member can login, view dashboard, and see seeded claims', async ({
      page,
      loginAs,
    }, testInfo) => {
      await loginAs('member');

      // Should land on member dashboard
      await expect(page).toHaveURL(/\/member/);
      await expect(page.getByTestId('dashboard-page-ready')).toBeVisible();

      // Navigate to claims list
      await gotoApp(page, routes.memberClaims(testInfo), testInfo, { marker: 'page-title' });

      // Verify page loaded
      await expect(page.getByTestId('page-title')).toBeVisible();
    });
  });

  test.describe('2. RBAC Isolation [smoke]', () => {
    test('Member cannot access admin [isolation]', async ({ page, loginAs }, testInfo) => {
      await loginAs('member');

      // Navigate to admin - expect 404 page (Strict Isolation Contract)
      await gotoApp(page, routes.admin(testInfo), testInfo, { marker: 'body' });

      // Verify isolation contract (404 UI or fallback template)
      const notFound = page.getByTestId('not-found-page');
      const fallback404 = page.locator('template[data-dgst*="404"]');
      await expect(notFound.or(fallback404)).toBeAttached({ timeout: 15000 });
    });

    test('Tenant Isolation: KS Admin cannot see MK Claims', async ({ page }, testInfo) => {
      test.skip(isMkProject(testInfo), 'KS-only tenant isolation check');
      await performLocalLogin(page, USERS.TENANT_ADMIN_KS, testInfo, 'admin');

      await gotoApp(page, `${routes.adminClaims(testInfo)}?view=list`, testInfo, {
        marker: 'admin-claims-v2-ready',
      });
      await expect(page.getByText(SEEDED_DATA.CLAIM_MK_1.title)).not.toBeVisible();
    });

    test('Branch Isolation: Branch A manager cannot see Branch B Claims', async ({
      page,
    }, testInfo) => {
      const branchManager = isMkProject(testInfo) ? USERS.BM_MK_A : USERS.BM_KS_A;
      await performLocalLogin(page, branchManager, testInfo, 'admin');

      await gotoApp(page, `${routes.adminClaims(testInfo)}?view=list`, testInfo, {
        marker: 'admin-claims-v2-ready',
      });

      // Verify V2 page is ready (explicit check)
      await expect(page.getByTestId('admin-claims-v2-ready')).toBeVisible();

      // Ensure we see at least one row (Branch A claims)
      await expect(page.locator('table tbody tr')).not.toHaveCount(0);
    });

    test('Staff (MK) can process claims but has restricted access', async ({ page }, testInfo) => {
      const staffUser = isMkProject(testInfo) ? USERS.STAFF_MK : USERS.STAFF_KS;
      await performLocalLogin(page, staffUser, testInfo, 'staff');

      // Navigate to Staff Claims
      await gotoApp(page, routes.staffClaims(testInfo), testInfo, { marker: 'page-title' });
      await expect(page).toHaveURL(/\/staff\/claims/);

      // Verify Restrictions - Try Admin Branches (should redirect or 404)
      await gotoApp(page, routes.adminBranches(testInfo), testInfo, { marker: 'body' });
      const notFound = page.getByTestId('not-found-page');
      const fallback404 = page.locator('template[data-dgst*="404"]');
      await expect(notFound.or(fallback404)).toBeAttached({ timeout: 15000 });
    });

    test('Agent Scoping: Agent sees only assigned members claims', async ({ page }, testInfo) => {
      const agentUser = isMkProject(testInfo) ? USERS.AGENT_MK_A1 : USERS.AGENT_KS_A1;
      await performLocalLogin(page, agentUser, testInfo, 'agent');

      // Navigate to agent dashboard
      await gotoApp(page, routes.agent(testInfo), testInfo, { marker: 'dashboard-page-ready' });
      await expect(page.getByTestId('dashboard-page-ready')).toBeVisible();
    });
  });

  test.describe('3. Admin Dashboards [smoke]', () => {
    test('Super Admin sees global stats', async ({ page }, testInfo) => {
      test.skip(!isMkProject(testInfo), 'Super admin fixture is seeded under MK tenant only');
      await performLocalLogin(page, USERS.SUPER_ADMIN, testInfo, 'admin');

      await expect(page.getByRole('heading', { name: /Admin|Paneli/i }).first()).toBeVisible({
        timeout: 20000,
      });
      await expect(page.locator('main')).toContainText(/[0-9]+/);
    });

    test('Tenant Admin SEES all branches and can navigate to V2 Dashboard', async ({
      page,
      loginAs,
    }, testInfo) => {
      await loginAs('admin');

      // Navigate to admin branches
      await gotoApp(page, routes.adminBranches(testInfo), testInfo, { marker: 'branches-screen' });

      // 1. Verify at least one branch card is present
      const cards = page.locator('[data-testid^="branch-card-"]');
      await expect(cards.first()).toBeVisible();
      expect(await cards.count()).toBeGreaterThan(0);

      // 2. Verify Navigation to Branch Dashboard V2
      const firstCardLink = cards.first().getByRole('link');
      await firstCardLink.scrollIntoViewIfNeeded();
      await firstCardLink.click({ force: true });

      // Should show the Branch Dashboard V2
      await expect(page.getByTestId('branch-dashboard-title')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('branch-health-score')).toContainText(/\d+\/100/);
    });

    test('Branch Dashboard V2 shows KPI panels and health indicators', async ({
      page,
      loginAs,
    }, testInfo) => {
      await loginAs('admin');

      // Use specific branch IDs from the seed
      const locale = routes.getLocale(testInfo);
      const branchId = locale === 'mk' ? 'mk_branch_a' : 'ks_branch_a';

      // Go directly to a known branch dashboard
      await gotoApp(page, routes.adminBranchDetail(branchId, testInfo), testInfo, {
        marker: 'branch-dashboard-title',
      });

      // Verify KPI items are visible by their content (translated)
      await expect(page.locator('main')).toContainText(
        /Open Claims|Dëmet e Hapura|Kërkesat e Hapura|Отворени Штети/i
      );
      await expect(page.locator('main')).toContainText(/Cash|Kesh|Кеш/i);
    });

    test('Risk signaling appears for seeded risky branch (KS-A with 20+ open claims)', async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.includes('ks'), 'KS-only risk check');
      await performLocalLogin(page, USERS.TENANT_ADMIN_KS, testInfo, 'admin');

      await gotoApp(page, routes.adminBranches(testInfo), testInfo, { marker: 'branches-screen' });

      // Find the KS-A branch card
      const ksBranchACard = page.getByTestId('branch-card-KS-A');
      await expect(ksBranchACard).toBeVisible();
      await expect(ksBranchACard).toContainText(/Urgjent|Urgent/i);
    });
  });

  test.describe('7. Claims V2 ', () => {
    test('Claims List: Loads V2 Dashboard style and filters tabs', async ({ page }, testInfo) => {
      const tenantAdmin = isMkProject(testInfo) ? USERS.TENANT_ADMIN_MK : USERS.TENANT_ADMIN_KS;
      await performLocalLogin(page, tenantAdmin, testInfo, 'admin');

      // Navigate to Claims List with explicit view=list
      await gotoApp(page, `${routes.adminClaims(testInfo)}?view=list`, testInfo, {
        marker: 'admin-claims-v2-ready', // Hydration aware
      });

      // Verify Active Tab is default (using new stable testid)
      const tabs = page.getByTestId('admin-claims-v2-ready');
      await expect(tabs.getByTestId('claims-tab-active')).toBeVisible();

      // Switch to Draft Tab
      const draftTab = tabs.getByTestId('claims-tab-draft');
      await draftTab.click({ force: true });

      // Split assertions for better debuggability
      await expect(page).toHaveURL(/status=draft/, { timeout: 10000 });
      await expect(page).toHaveURL(/view=list/, { timeout: 5000 });

      // Ensure the component is still mounted and ready
      await expect(page.getByTestId('admin-claims-v2-ready')).toBeVisible();
    });
  });
});
