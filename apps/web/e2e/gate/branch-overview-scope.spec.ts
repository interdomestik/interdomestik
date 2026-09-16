import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { getProjectUrlInfo, ipForRole } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withBranchOverviewScopeFixture } from './branch-overview-scope.fixture';

async function signIn(
  page: Page,
  info: TestInfo,
  credentials: { email: string; password: string },
  role: 'admin' | 'branch_manager'
): Promise<void> {
  const { origin } = getProjectUrlInfo(info, null);
  await page.context().clearCookies();
  const response = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    data: credentials,
    headers: {
      Origin: origin,
      'x-forwarded-for': ipForRole(role),
      ...info.project.use.extraHTTPHeaders,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function expectKpi(page: Page, testId: string, value: number): Promise<void> {
  await expect(page.getByTestId(testId).locator('span').last()).toHaveText(String(value));
}

test.describe('S2 branch overview scope protection', () => {
  test('mounted overview and branch query preserve branch scope and tenant-admin baseline', async ({
    page,
  }, info) => {
    await withBranchOverviewScopeFixture(info.project.name, async fixture => {
      await signIn(
        page,
        info,
        { email: fixture.branchManager.email, password: fixture.password },
        'branch_manager'
      );

      await gotoApp(page, routes.admin(info), info, { marker: 'branch-dashboard-title' });
      await expect(page).toHaveURL(
        new RegExp(`/admin/branches/${encodeURIComponent(fixture.branches.own.id)}$`)
      );
      await expect(page.getByTestId('branch-dashboard-title')).toHaveText(
        fixture.branches.own.name
      );

      await expectKpi(page, 'branch-kpi-open-claims', 1);
      await expectKpi(page, 'branch-kpi-cash-pending', 0);
      await expectKpi(page, 'branch-kpi-sla-breaches', 1);
      await expectKpi(page, 'branch-kpi-total-agents', 1);
      await expectKpi(page, 'branch-kpi-total-members', 1);
      await expect(page.getByTestId('branch-pipeline-submitted').locator('span').last()).toHaveText(
        '1'
      );

      const agentRow = page.getByRole('row').filter({
        has: page.getByText(fixture.agent.name, { exact: true }),
      });
      await expect(agentRow.getByRole('cell').nth(2)).toHaveText('1');
      await expect(agentRow.getByRole('cell').nth(3)).toHaveText('-');
      await expect(agentRow.getByRole('cell').nth(4)).toHaveText('1');

      const staffRow = page.getByRole('row').filter({
        has: page.getByText(fixture.staffName, { exact: true }),
      });
      await expect(staffRow.getByRole('cell').nth(1)).toHaveText('1');

      for (const deniedBranch of [fixture.branches.sibling, fixture.branches.foreign]) {
        await gotoApp(page, routes.adminBranchDetail(deniedBranch.id, info), info, {
          marker: 'branch-dashboard-title',
        });
        await expect(page).toHaveURL(
          new RegExp(`/admin/branches/${encodeURIComponent(fixture.branches.own.id)}$`)
        );
        await expect(page.getByTestId('branch-dashboard-title')).toHaveText(
          fixture.branches.own.name
        );
        await expect(page.locator('body')).not.toContainText(deniedBranch.name);
      }

      await signIn(
        page,
        info,
        { email: fixture.tenantAdmin.email, password: fixture.password },
        'admin'
      );
      await gotoApp(page, routes.admin(info), info, { marker: 'admin-overview-kpis' });
      await expect(page).toHaveURL(/\/admin\/overview$/);

      const visibleBranchRows = page.locator('[data-testid="admin-overview-branch-row"]:visible');
      const ownBranchRow = visibleBranchRows.filter({
        has: page.getByText(fixture.branches.own.name, { exact: true }),
      });
      const siblingBranchRow = visibleBranchRows.filter({
        has: page.getByText(fixture.branches.sibling.name, { exact: true }),
      });
      await expect(ownBranchRow).toHaveCount(1);
      await expect(ownBranchRow.locator('span').last()).toHaveText('1');
      await expect(siblingBranchRow).toHaveCount(1);
      await expect(siblingBranchRow.locator('span').last()).toHaveText('2');
      await expect(page.locator('body')).not.toContainText(fixture.branches.foreign.name);

      await signIn(
        page,
        info,
        { email: fixture.missingBranchManager.email, password: fixture.password },
        'branch_manager'
      );
      await gotoApp(page, routes.admin(info), info, { marker: 'not-found-page' });
      await expect(page).toHaveURL(/\/admin\/overview$/);
      await expect(page).not.toHaveURL(/\/admin\/branches\/(null|undefined)$/);
      await expect(page.getByTestId('not-found-page')).toBeVisible();

      await gotoApp(page, routes.adminBranchDetail(fixture.branches.own.id, info), info, {
        marker: 'not-found-page',
      });
      await expect(page).toHaveURL(
        new RegExp(`/admin/branches/${encodeURIComponent(fixture.branches.own.id)}$`)
      );
      await expect(page.getByTestId('not-found-page')).toBeVisible();
    });
  });
});
