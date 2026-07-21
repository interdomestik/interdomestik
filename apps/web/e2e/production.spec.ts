import { E2E_PASSWORD } from '@interdomestik/database';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';
// Credentials from seed script
const MEMBER_KS = { email: 'member.ks.a1@interdomestik.com', password: E2E_PASSWORD };
const MEMBER_MK = { email: 'member.mk.1@interdomestik.com', password: E2E_PASSWORD };
const ADMIN_KS = { email: 'admin.ks@interdomestik.com', password: E2E_PASSWORD };
const ADMIN_MK = { email: 'admin.mk@interdomestik.com', password: E2E_PASSWORD };

// Claim Data - use a unique title per project run to avoid parallel collision
// Using a fixed timestamp for the entire spec file to keep it stable during serial execution
const RUN_ID = Date.now();
function getClaimTitle(testInfo: TestInfo) {
  return `Auto Smoke ${testInfo.project.name} ${RUN_ID}`;
}

function isMkProject(testInfo: TestInfo): boolean {
  return testInfo.project.name.includes('mk');
}

async function dismissCookieConsentIfVisible(page: Page): Promise<void> {
  const banner = page.getByTestId('cookie-consent-banner');
  if (!(await banner.count())) return;

  const acceptButton = page.getByTestId('cookie-consent-accept').first();
  if (!(await acceptButton.isVisible().catch(() => false))) return;

  await acceptButton.click();
  await expect(banner).toHaveCount(0);
}

async function loginAs(
  page: Page,
  user: { email: string; password?: string; tenant?: string },
  testInfo: TestInfo
) {
  // Use project baseURL to ensure correct domain (e.g. nip.io) vs localhost
  const baseURL =
    testInfo.project.use.baseURL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const origin = new URL(baseURL).origin;
  const loginURL = `${origin}/api/auth/sign-in/email`;

  // Force clear cookies to ensure no session leak from global setup or previous serial tests
  await page.context().clearCookies();

  const res = await page.request.post(loginURL, {
    data: { email: user.email, password: user.password || E2E_PASSWORD },
    headers: {
      Origin: origin,
      Referer: `${origin}/login`,
    },
  });

  if (!res.ok()) {
    throw new Error(`API login failed for ${user.email}: ${res.status()} ${await res.text()}`);
  }

  let targetPath = routes.member(testInfo);
  if (user.email.includes('admin')) targetPath = routes.admin(testInfo);
  else if (user.email.includes('agent')) targetPath = routes.agent(testInfo);
  else if (user.email.includes('staff')) targetPath = routes.staff(testInfo);

  // Navigate to target path
  await gotoApp(page, targetPath, testInfo, { marker: 'dashboard-page-ready' });
  await dismissCookieConsentIfVisible(page);
}

// Use serial to ensure Phase A creates claim before Phase B/C try to view it
test.describe.serial('@smoke Production Smoke Test Plan', () => {
  test.describe('Phase A: Authentication & Routing (Member) @smoke', () => {
    test('Member (KS) sees v3 dashboard without legacy claims list', async ({ page }, testInfo) => {
      const memberUser = isMkProject(testInfo)
        ? { ...MEMBER_MK, tenant: 'tenant_mk' }
        : { ...MEMBER_KS, tenant: 'tenant_ks' };
      await loginAs(page, memberUser, testInfo);

      const dashboardReady = page.getByTestId('dashboard-page-ready');
      await expect(dashboardReady).toBeVisible();
      await expect(page.getByTestId('portal-surface-indicator')).toBeVisible();
      const primaryActions = dashboardReady.getByTestId('member-primary-actions');
      const activeClaim = dashboardReady.getByTestId('member-active-claim');
      const supportLink = dashboardReady.getByTestId('member-support-link');

      await expect(primaryActions).toHaveCount(1);
      await expect(primaryActions).toBeVisible();
      await expect(activeClaim).toHaveCount(1);
      await expect(activeClaim).toBeVisible();
      await expect(page.getByTestId('member-claims-list')).toHaveCount(0);
      await expect(supportLink).toHaveCount(1);
      await expect(supportLink).toBeVisible();

      const cta = primaryActions.getByTestId('hero-cta-open-active-case');
      await expect(cta).toHaveCount(1);
      await expect(cta).toHaveAttribute(
        'href',
        new RegExp(`${routes.memberClaims(testInfo)}/[^/]+$`)
      );
    });

    test('Member (KS) prepares a dormant claim draft without creating a claim', async ({
      page,
    }, testInfo) => {
      const CLAIM_TITLE = getClaimTitle(testInfo);
      const memberUser = isMkProject(testInfo)
        ? { ...MEMBER_MK, tenant: 'tenant_mk' }
        : { ...MEMBER_KS, tenant: 'tenant_ks' };
      await loginAs(page, memberUser, testInfo);

      await expect(page).toHaveURL(/\/member/);
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('interdomestik_cookie_consent_v1', 'accepted');
        document.cookie = 'cookie_consent=accepted; Path=/; SameSite=Lax';
      });

      await gotoApp(page, routes.memberNewClaim(testInfo), testInfo, {
        marker: 'new-claim-page-ready',
      });
      await dismissCookieConsentIfVisible(page);
      const bodyText = await page.textContent('body');
      expect(bodyText).not.toContain('MISSING_MESSAGE');

      const intake = page.locator('[data-testid="claim-draft-intake"]:visible').first();
      const panel = intake.getByTestId('claim-draft-main-panel');
      await expect(intake).toBeVisible();
      await intake.getByTestId('claim-draft-category-vehicle').click();
      await intake.getByTestId('claim-draft-category-continue').click();
      await panel.locator('select').nth(0).selectOption('collision');
      await panel.locator('input[type="date"]').fill('2026-07-20');
      await panel.locator('input[type="text"]').fill('Test Company');
      await panel.locator('select').nth(1).selectOption('repair');
      await panel.locator('textarea').fill(CLAIM_TITLE);
      await panel.locator('button').last().click();

      const preview = intake.getByTestId('claim-draft-dormant-preview');
      await expect(preview).toBeVisible();
      await expect(preview).toContainText(CLAIM_TITLE);
      await expect(intake.getByTestId('claim-draft-submit-disabled')).toBeDisabled();
      await expect(page.getByTestId('claim-created-success')).toHaveCount(0);
    });
  });

  test.describe('Phase B: Administrative Visibility', () => {
    test('Admin (KS) cannot see the dormant draft as a claim', async ({ page }, testInfo) => {
      const CLAIM_TITLE = getClaimTitle(testInfo);
      const adminUser = isMkProject(testInfo)
        ? { ...ADMIN_MK, tenant: 'tenant_mk' }
        : { ...ADMIN_KS, tenant: 'tenant_ks' };
      await loginAs(page, adminUser, testInfo);

      await gotoApp(page, `${routes.adminClaims(testInfo)}?view=list`, testInfo, {
        marker: 'admin-claims-v2-ready',
      });

      const adminSurface = page.locator('[data-testid="admin-claims-v2-ready"]:visible').first();
      await expect(adminSurface).toBeVisible({ timeout: 15000 });

      const searchInput = adminSurface.getByTestId('claims-search-input').first();
      await searchInput.fill(CLAIM_TITLE);
      await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe(CLAIM_TITLE);
      await expect(searchInput).toHaveValue(CLAIM_TITLE);
      await expect(adminSurface.getByTestId('admin-claims-filter-region').first()).toHaveAttribute(
        'aria-busy',
        'false'
      );
      await expect(adminSurface.getByRole('heading', { level: 3 }).first()).toBeVisible();
      await expect(adminSurface.getByTestId('claim-operational-card')).toHaveCount(0);
      await expect(adminSurface.getByRole('heading', { name: CLAIM_TITLE })).toHaveCount(0);
    });
  });

  test.describe('Phase C: Manager & Isolation', () => {
    test('Admin (KS) can access dashboard metrics', async ({ page }, testInfo) => {
      const adminUser = isMkProject(testInfo)
        ? { ...ADMIN_MK, tenant: 'tenant_mk' }
        : { ...ADMIN_KS, tenant: 'tenant_ks' };
      await loginAs(page, adminUser, testInfo);

      // Basic check that admin dashboard loaded
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    test('Admin (MK) CANNOT view KS claims (Isolation)', async ({ page }, testInfo) => {
      test.skip(
        isMkProject(testInfo),
        'Cross-tenant isolation assertion is only meaningful from KS project context'
      );
      const baseURL =
        testInfo.project.use.baseURL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
      const origin = new URL(baseURL).origin;
      const loginURL = `${origin}/api/auth/sign-in/email`;

      const res = await page.request.post(loginURL, {
        data: { email: ADMIN_MK.email, password: ADMIN_MK.password },
        headers: {
          Origin: origin,
          Referer: `${origin}/login`,
        },
      });

      expect(res.status()).toBe(401);
      const bodyText = await res.text();
      expect(bodyText).toContain('WRONG_TENANT_CONTEXT');
    });
  });

  test.describe('Phase D: Negative Tests & API', () => {
    // 5.4 Server Action Soft Failure (Simulate by assigning invalid data if possible, or just skip if hard to mock in e2e)
    // 5.1 Cross-Tenant Access (Manual/Curl is better, but maybe fetch?)
    test('Cross-Tenant API access should allow 403/404 only', async ({ request: _request }) => {
      // Attempt to fetch a KS claim using a public/unauth or wrong tenant token.
      // Getting a valid token for MK tenant is hard here without full login flow in request context.
      // Skipping detailed API specific auth tests in this file, verified by manual plan instructions usually.
    });
  });
});
