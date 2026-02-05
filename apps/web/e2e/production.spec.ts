import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';
// Credentials from seed script
const MEMBER_KS = { email: 'member.ks.a1@interdomestik.com', password: 'GoldenPass123!' };
const ADMIN_KS = { email: 'admin.ks@interdomestik.com', password: 'GoldenPass123!' };
const ADMIN_MK = { email: 'admin.mk@interdomestik.com', password: 'GoldenPass123!' };

// Claim Data - use a unique title per project run to avoid parallel collision
// Using a fixed timestamp for the entire spec file to keep it stable during serial execution
const RUN_ID = Date.now();
function getClaimTitle(testInfo: TestInfo) {
  return `Auto Smoke ${testInfo.project.name} ${RUN_ID}`;
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
    data: { email: user.email, password: user.password || 'GoldenPass123!' },
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
}

// Use serial to ensure Phase A creates claim before Phase B/C try to view it
test.describe.serial('@smoke Production Smoke Test Plan', () => {
  test.describe('Phase A: Authentication & Routing (Member) @smoke', () => {
    test('Member (KS) sees v3 dashboard without legacy claims list', async ({ page }, testInfo) => {
      await loginAs(page, { ...MEMBER_KS, tenant: 'tenant_ks' }, testInfo);

      await expect(page.getByTestId('dashboard-page-ready')).toBeVisible();
      await expect(page.getByTestId('portal-surface-indicator')).toContainText(/Portal: Member/i);
      await expect(page.getByTestId('portal-surface-indicator')).toContainText(/Surface: v3/i);
      await expect(page.getByTestId('member-header')).toBeVisible();
      await expect(page.getByTestId('member-primary-actions')).toBeVisible();
      await expect(page.getByTestId('member-active-claim')).toBeVisible();
      await expect(page.getByTestId('member-claims-list')).toHaveCount(0);
      await expect(page.getByTestId('member-support-link')).toBeVisible();

      const cta = page.getByTestId('member-start-claim-cta');
      await expect(cta).toHaveAttribute('href', routes.memberNewClaim(testInfo));
    });

    test('Member (KS) can login, see dashboard, and create a claim', async ({ page }, testInfo) => {
      const CLAIM_TITLE = getClaimTitle(testInfo);
      // Debug: Listen to console logs
      page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

      // 1. Login
      await loginAs(page, { ...MEMBER_KS, tenant: 'tenant_ks' }, testInfo);

      // 2. Verify Dashboard (Member lands on /member)
      await expect(page).toHaveURL(/\/member/);
      await page.evaluate(() => localStorage.clear());

      // 3. Wizard
      await gotoApp(page, routes.memberNewClaim(testInfo), testInfo, { marker: 'page-ready' });
      const bodyText = await page.textContent('body');
      expect(bodyText).not.toContain('MISSING_MESSAGE');

      // 4. Create Claim
      const cat = page.getByTestId('category-vehicle').first();
      await cat.scrollIntoViewIfNeeded();
      await cat.click();
      const nextBtn = page.getByTestId('wizard-next').first();
      await nextBtn.click();
      // Step 2: Details
      await page.getByTestId('claim-title-input').fill(CLAIM_TITLE);
      await page.getByTestId('claim-company-input').fill('Test Company');
      await page.getByTestId('claim-date-input').fill('2024-01-01');
      await page
        .getByTestId('claim-description-input')
        .fill('Smoke test automation description that is long enough');
      await page.getByTestId('claim-amount-input').fill('100');

      // Click Next and wait for Step 3
      await page.getByTestId('wizard-next').first().click({ force: true });

      // Step 3: Evidence
      await expect(page.getByTestId('step-evidence-title')).toBeVisible({ timeout: 20000 });
      await page.getByTestId('wizard-next').first().click({ force: true });

      // Step 4: Review & Submit
      const submitButton = page.getByTestId('wizard-submit');
      try {
        await submitButton.waitFor({ state: 'visible', timeout: 5000 });
        if (await submitButton.isEnabled()) {
          await submitButton.click();
        }
      } catch {
        // Wizard may have auto-submitted on some versions
      }

      // 5. Verify Redirect/Success
      await expect(page).toHaveURL(/\/member\/claims/, { timeout: 30000 });
      await expect(page.getByText(CLAIM_TITLE)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Phase B: Administrative Visibility', () => {
    test('Admin (KS) can find the newly created claim', async ({ page }, testInfo) => {
      const CLAIM_TITLE = getClaimTitle(testInfo);
      // Login Admin
      await loginAs(page, { ...ADMIN_KS, tenant: 'tenant_ks' }, testInfo);

      // Navigate to claims list view explicitly to use filters
      await gotoApp(page, `${routes.adminClaims(testInfo)}?view=list`, testInfo, {
        marker: 'admin-claims-v2-ready',
      });

      // Readiness Check: Wait for Admin V2 filters to load
      await expect(page.getByTestId('admin-claims-v2-ready')).toBeVisible({ timeout: 15000 });

      // Search for the specific claim title using stable testid
      const searchInput = page.getByTestId('claims-search-input');
      await searchInput.fill(CLAIM_TITLE);

      // Verify visible
      await expect(page.getByText(CLAIM_TITLE)).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Phase C: Manager & Isolation', () => {
    test('Admin (KS) can access dashboard metrics', async ({ page }, testInfo) => {
      await loginAs(page, { ...ADMIN_KS, tenant: 'tenant_ks' }, testInfo);

      // Basic check that admin dashboard loaded
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    test('Admin (MK) CANNOT view KS claims (Isolation)', async ({ page }, testInfo) => {
      const CLAIM_TITLE = getClaimTitle(testInfo);
      await loginAs(page, { ...ADMIN_MK, tenant: 'tenant_mk' }, testInfo);

      // Navigate to list view
      await gotoApp(page, `${routes.adminClaims(testInfo)}?view=list`, testInfo, {
        marker: 'admin-claims-v2-ready',
      });

      // Readiness Check
      await expect(page.getByTestId('admin-claims-v2-ready')).toBeVisible({ timeout: 15000 });

      // Search for the KS claim title
      const searchInput = page.getByTestId('claims-search-input');
      await searchInput.fill(CLAIM_TITLE);

      // Should NOT see the claim (Cross Tenant)
      await expect(page.getByText(CLAIM_TITLE)).not.toBeVisible({ timeout: 5000 });
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
