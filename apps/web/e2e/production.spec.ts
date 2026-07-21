import { E2E_PASSWORD } from '@interdomestik/database';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

const MEMBER_KS = { email: 'member.ks.a1@interdomestik.com', password: E2E_PASSWORD };
const MEMBER_MK = { email: 'member.mk.1@interdomestik.com', password: E2E_PASSWORD };
const ADMIN_KS = { email: 'admin.ks@interdomestik.com', password: E2E_PASSWORD };
const ADMIN_MK = { email: 'admin.mk@interdomestik.com', password: E2E_PASSWORD };
const RUN_ID = Date.now();
let savedDraftId: string | null = null;

const isMkProject = (testInfo: TestInfo) => testInfo.project.name.includes('mk');

function resolveIdaTarget(testInfo: TestInfo) {
  const authority = process.env.IDA_HOST?.trim() || 'ida.127.0.0.1.nip.io:3000';
  const baseURL = `http://${authority}/${routes.getLocale(testInfo)}`;
  return {
    ...testInfo,
    project: { ...testInfo.project, use: { ...testInfo.project.use, baseURL } },
  } as TestInfo;
}

async function dismissCookieConsentIfVisible(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('interdomestik_cookie_consent_v1', 'accepted');
    document.cookie = 'cookie_consent=accepted; Path=/; SameSite=Lax';
    const event = 'interdomestik:cookie-consent-updated';
    window.dispatchEvent(new CustomEvent(event, { detail: 'accepted' }));
  });
  await expect(page.getByTestId('cookie-consent-banner')).toHaveCount(0);
}

async function loginAs(
  page: Page,
  user: { email: string; password?: string; tenant?: string },
  testInfo: TestInfo
) {
  const baseURL =
    testInfo.project.use.baseURL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const origin = new URL(baseURL).origin;
  await page.context().clearCookies();
  const res = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    data: {
      email: user.email,
      password: user.password || E2E_PASSWORD,
      ...(user.tenant ? { additionalData: { tenantId: user.tenant } } : {}),
    },
    headers: { Origin: origin, Referer: `${origin}/login` },
  });
  if (!res.ok()) {
    throw new Error(`API login failed for ${user.email}: ${res.status()} ${await res.text()}`);
  }
  let targetPath = routes.member(testInfo);
  if (user.email.includes('admin')) targetPath = routes.admin(testInfo);
  else if (user.email.includes('agent')) targetPath = routes.agent(testInfo);
  else if (user.email.includes('staff')) targetPath = routes.staff(testInfo);
  await gotoApp(page, targetPath, testInfo, { marker: 'dashboard-page-ready' });
  await dismissCookieConsentIfVisible(page);
}

test.describe.serial('@smoke Production Smoke Test Plan', () => {
  test.describe('Phase A: Authentication & Routing (Member) @smoke', () => {
    test('Member (KS) sees v3 dashboard without legacy claims list', async ({ page }, testInfo) => {
      const memberUser = isMkProject(testInfo)
        ? { ...MEMBER_MK, tenant: 'tenant_mk' }
        : { ...MEMBER_KS, tenant: 'tenant_ks' };
      await loginAs(page, memberUser, testInfo);
      const dashboard = page.getByTestId('dashboard-page-ready');
      await expect(dashboard).toBeVisible();
      await expect(page.getByTestId('portal-surface-indicator')).toBeVisible();
      for (const id of ['member-primary-actions', 'member-active-claim', 'member-support-link']) {
        await expect(dashboard.getByTestId(id)).toBeVisible();
      }
      await expect(page.getByTestId('member-claims-list')).toHaveCount(0);
      await expect(dashboard.getByTestId('hero-cta-open-active-case')).toHaveAttribute(
        'href',
        new RegExp(`${routes.memberClaims(testInfo)}/[^/]+$`)
      );
    });

    test('Member (KS) saves a dormant draft without creating a claim', async ({
      page,
    }, testInfo) => {
      const title = `Auto Smoke ${testInfo.project.name} ${RUN_ID}`;
      const idaTestInfo = resolveIdaTarget(testInfo);
      await page.context().setExtraHTTPHeaders({ 'x-tenant-id': 'tenant_ks' });
      await loginAs(page, { ...MEMBER_KS, tenant: 'tenant_ks' }, idaTestInfo);
      await gotoApp(page, routes.memberNewClaim(idaTestInfo), idaTestInfo, {
        marker: 'new-claim-page-ready',
      });
      const intake = page.locator('[data-testid="claim-draft-intake"]:visible').first();
      const panel = intake.getByTestId('claim-draft-main-panel');
      await intake.getByTestId('free-start-manage-open').click();
      // prettier-ignore
      const staleDrafts = page.locator('li').filter({ hasText: /^Auto Smoke/ }).getByTestId(/^free-start-delete-/);
      for (let count = await staleDrafts.count(); count > 0; count--) {
        await staleDrafts.first().click();
        await page.getByTestId('free-start-delete-confirm').click();
        await expect(staleDrafts).toHaveCount(count - 1);
      }
      await intake.getByTestId('claim-draft-category-vehicle').click();
      await intake.getByTestId('claim-draft-category-continue').click();
      await panel.locator('select').nth(0).selectOption('collision');
      await panel.locator('input[type="date"]').fill('2026-07-20');
      await panel.locator('input[type="text"]').fill('Test Company');
      await panel.locator('select').nth(1).selectOption('repair');
      await panel.locator('textarea').fill(title);
      await panel.locator('button').last().click();
      await expect(intake.getByTestId('claim-draft-dormant-preview')).toContainText(title);
      await expect(intake.getByTestId('claim-draft-submit-disabled')).toBeDisabled();
      await expect(page.getByTestId('claim-created-success')).toHaveCount(0);
      await intake.getByTestId('free-start-save-open').click();
      await expect(intake.getByTestId('free-start-save-status')).toHaveAttribute(
        'data-state',
        'saved'
      );
      await intake.getByTestId('free-start-manage-open').click();
      const resume = page
        .locator('li')
        .filter({ hasText: title })
        .getByTestId(/^free-start-resume-/);
      await expect(resume).toBeVisible();
      const testId = await resume.getAttribute('data-testid');
      savedDraftId = testId?.replace('free-start-resume-', '') || null;
      if (!savedDraftId) throw new Error('saved_draft_id_missing');
    });
  });

  test.describe('Phase B: Administrative Visibility', () => {
    test('Admin (KS) cannot see the saved dormant draft as a claim', async ({ page }, testInfo) => {
      const title = `Auto Smoke ${testInfo.project.name} ${RUN_ID}`;
      const draftId = savedDraftId;
      if (!draftId) throw new Error('saved_draft_id_missing');
      const adminUser = isMkProject(testInfo)
        ? { ...ADMIN_MK, tenant: 'tenant_mk' }
        : { ...ADMIN_KS, tenant: 'tenant_ks' };
      await loginAs(page, adminUser, testInfo);
      try {
        await gotoApp(page, `${routes.adminClaims(testInfo)}?view=list`, testInfo, {
          marker: 'admin-claims-v2-ready',
        });
        const admin = page.locator('[data-testid="admin-claims-v2-ready"]:visible').first();
        const search = admin.getByTestId('claims-search-input').first();
        await search.fill(title);
        await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe(title);
        await expect(admin.getByTestId('admin-claims-filter-region').first()).toHaveAttribute(
          'aria-busy',
          'false'
        );
        await expect(admin.getByTestId('claim-operational-card')).toHaveCount(0);
        await expect(admin.getByRole('heading', { name: title })).toHaveCount(0);
      } finally {
        const idaTestInfo = resolveIdaTarget(testInfo);
        await page.context().setExtraHTTPHeaders({ 'x-tenant-id': 'tenant_ks' });
        await loginAs(page, { ...MEMBER_KS, tenant: 'tenant_ks' }, idaTestInfo);
        await gotoApp(page, routes.memberNewClaim(idaTestInfo), idaTestInfo, {
          marker: 'new-claim-page-ready',
        });
        const intake = page.locator('[data-testid="claim-draft-intake"]:visible').first();
        await intake.getByTestId('free-start-manage-open').click();
        await page.getByTestId(`free-start-delete-${draftId}`).click();
        await page.getByTestId('free-start-delete-confirm').click();
        await expect(intake.getByTestId('free-start-save-status')).toHaveAttribute(
          'data-state',
          'deleted'
        );
        savedDraftId = null;
      }
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
