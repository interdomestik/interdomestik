import type { Page, TestInfo } from '@playwright/test';
import { db, leadPaymentAttempts } from '@interdomestik/database';
import { memberLeads } from '@interdomestik/database/schema/leads';
import { and, eq, inArray } from 'drizzle-orm';
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

const KS_TENANT_ID = 'tenant_ks';
const KS_BRANCH_A = 'ks_branch_a';
const KS_BRANCH_B = 'ks_branch_b';
const KS_AGENT_A1_NAME = 'Blerim Hoxha';
const NEEDS_INFO_ATTEMPT_ID = 'golden_attempt_ks_a_cash_lead_1';
const RESOLVED_ATTEMPT_ID = 'golden_attempt_ks_a_cash_lead_2';
const CASH_OPEN_STATUSES = ['pending', 'needs_info'] as const;
const WATCH_DELAY_MS = Number(process.env.PC04_WATCH_DELAY_MS ?? 0);

async function listOpenCashForBranch(branchId = KS_BRANCH_A) {
  return db
    .select({ id: leadPaymentAttempts.id })
    .from(leadPaymentAttempts)
    .innerJoin(memberLeads, eq(memberLeads.id, leadPaymentAttempts.leadId))
    .where(
      and(
        eq(leadPaymentAttempts.tenantId, KS_TENANT_ID),
        eq(memberLeads.tenantId, KS_TENANT_ID),
        eq(memberLeads.branchId, branchId),
        eq(leadPaymentAttempts.method, 'cash'),
        inArray(leadPaymentAttempts.status, [...CASH_OPEN_STATUSES])
      )
    );
}

async function setAttemptStatus(
  id: string,
  status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'rejected' | 'needs_info'
) {
  await db
    .update(leadPaymentAttempts)
    .set({ status, updatedAt: new Date() })
    .where(eq(leadPaymentAttempts.id, id));
}

async function resetWatchedAttempts() {
  await setAttemptStatus(NEEDS_INFO_ATTEMPT_ID, 'pending');
  await setAttemptStatus(RESOLVED_ATTEMPT_ID, 'pending');
}

async function watchStep(page: Page, label: string) {
  if (WATCH_DELAY_MS <= 0) return;

  console.log(`[PC04 Watch] ${label}`);
  await page.evaluate(text => {
    const id = 'pc04-watch-step';
    document.getElementById(id)?.remove();

    const marker = document.createElement('div');
    marker.id = id;
    marker.textContent = text;
    marker.style.position = 'fixed';
    marker.style.inset = '16px auto auto 16px';
    marker.style.zIndex = '2147483647';
    marker.style.padding = '10px 12px';
    marker.style.borderRadius = '8px';
    marker.style.background = '#111827';
    marker.style.color = '#f9fafb';
    marker.style.font = '600 14px/1.3 system-ui, sans-serif';
    marker.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
    document.body.appendChild(marker);
  }, label);
  await page.waitForTimeout(WATCH_DELAY_MS);
}

async function openBranchList(page: Page, testInfo: TestInfo, label: string) {
  await watchStep(page, label);
  await gotoApp(page, routes.adminBranches(testInfo), testInfo, { marker: 'page-ready' });
}

async function openBranchDashboard(page: Page, testInfo: TestInfo, label: string) {
  await watchStep(page, label);
  await gotoApp(page, routes.adminBranchDetail(KS_BRANCH_A, testInfo), testInfo, {
    marker: 'branch-dashboard-title',
  });
}

async function expectBranchCashCard(page: Page, branchCode: string, expectedCount: number) {
  const branchCard = page.getByTestId(`branch-card-${branchCode}`);
  await expect(branchCard).toBeVisible();
  await expect(branchCard.getByLabel(/Pagesa cash në pritje|Cash Pending/i)).toContainText(
    String(expectedCount)
  );
}

async function expectOpenCashState({
  branchId = KS_BRANCH_A,
  count,
  includes,
  excludes,
}: {
  branchId?: string;
  count: number;
  includes?: string;
  excludes?: string;
}) {
  const openCashAttempts = await listOpenCashForBranch(branchId);
  const ids = openCashAttempts.map(row => row.id);

  if (includes) expect(ids).toContain(includes);
  if (excludes) expect(ids).not.toContain(excludes);
  expect(openCashAttempts).toHaveLength(count);
}

async function expectDashboardAndAgentCash(page: Page, expectedCount: number) {
  await expect(page.getByTestId('branch-dashboard-title')).toBeVisible();
  await expect(page.locator('main')).toContainText(
    new RegExp(`Pagesa cash në pritje[\\s\\S]*${expectedCount}`, 'i')
  );

  const agentRow = page.getByRole('row', { name: new RegExp(KS_AGENT_A1_NAME, 'i') });
  await expect(agentRow).toBeVisible();
  await expect(agentRow).toContainText(String(expectedCount));
}

test.describe('PC04 branch cash truth', () => {
  test.afterEach(async () => {
    await resetWatchedAttempts();
  });

  test('branch list groups durable cash pressure by branch', async ({
    adminPage: page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes('ks'), 'KS golden seed scenario');

    await resetWatchedAttempts();

    await expectOpenCashState({ branchId: KS_BRANCH_A, count: 3 });
    await expectOpenCashState({ branchId: KS_BRANCH_B, count: 1 });

    await openBranchList(page, testInfo, 'Open admin branch list');

    await watchStep(page, 'KS-A shows three pending cash attempts');
    await expectBranchCashCard(page, 'KS-A', 3);

    await watchStep(page, 'KS-B keeps its own cash count isolated');
    await expectBranchCashCard(page, 'KS-B', 1);
  });

  test('branch dashboard derives cash pressure and agent health from pending plus needs_info attempts', async ({
    adminPage: page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes('ks'), 'KS golden seed scenario');

    await setAttemptStatus(NEEDS_INFO_ATTEMPT_ID, 'needs_info');

    try {
      await expectOpenCashState({ count: 3, includes: NEEDS_INFO_ATTEMPT_ID });

      await openBranchList(page, testInfo, 'Open admin branch list with needs_info attempt');
      await expectBranchCashCard(page, 'KS-A', 3);

      await openBranchDashboard(page, testInfo, 'Open KS-A branch dashboard');

      await watchStep(page, 'Dashboard KPI includes pending plus needs_info attempts');
      await watchStep(page, 'Agent health row inherits the durable cash count');
      await expectDashboardAndAgentCash(page, 3);
    } finally {
      await resetWatchedAttempts();
    }
  });

  test('resolved cash attempts are excluded from branch cash pressure', async ({
    adminPage: page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes('ks'), 'KS golden seed scenario');

    await setAttemptStatus(RESOLVED_ATTEMPT_ID, 'succeeded');

    try {
      await expectOpenCashState({ count: 2, excludes: RESOLVED_ATTEMPT_ID });

      await openBranchList(page, testInfo, 'Open branch list after one cash attempt is resolved');

      await watchStep(page, 'KS-A cash pressure drops to two');
      await expectBranchCashCard(page, 'KS-A', 2);

      await openBranchDashboard(
        page,
        testInfo,
        'Open KS-A dashboard with resolved attempt excluded'
      );

      await watchStep(page, 'Agent row also drops to two');
      await expectDashboardAndAgentCash(page, 2);
    } finally {
      await resetWatchedAttempts();
    }
  });
});
