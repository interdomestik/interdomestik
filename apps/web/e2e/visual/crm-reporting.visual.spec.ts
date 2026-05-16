import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { CRM_VISUAL_BASELINE_TAG } from './crm-visual-baseline.constants';
import { expectCrmVisualBaseline } from './crm-visual-baseline.helper';

function adminCrmRoute(testInfo: Parameters<typeof routes.getLocale>[0]): string {
  return `/${routes.getLocale(testInfo)}/admin/crm`;
}

function staffCrmRoute(testInfo: Parameters<typeof routes.getLocale>[0]): string {
  return `/${routes.getLocale(testInfo)}/staff/crm`;
}

test.describe(`${CRM_VISUAL_BASELINE_TAG} CRM reporting visual baseline`, () => {
  test.setTimeout(120_000);

  test.describe('KS/SQ role baselines', () => {
    test('agent CRM reporting baseline @crm-visual-ks-sq', async ({ page, loginAs }, testInfo) => {
      await loginAs('agent');
      await gotoApp(page, routes.agentCrm(testInfo), testInfo, {
        marker: 'agent-crm-page-ready',
        markerTimeoutMs: 30_000,
      });

      await expect(page.getByTestId('agent-crm-reporting-weighted-pipeline').first()).toBeVisible();
      await expect(page.getByTestId('agent-crm-reporting-source-breakdown').first()).toBeVisible();
      await expect(page.getByTestId('agent-crm-reporting-win-rate').first()).toBeVisible();
      await expectCrmVisualBaseline(page, 'agent-crm-page-ready', 'agent-crm-reporting.png');
    });

    test('admin CRM reporting and operations baseline @crm-visual-ks-sq', async ({
      page,
      loginAs,
    }, testInfo) => {
      await loginAs('admin');
      await gotoApp(page, adminCrmRoute(testInfo), testInfo, {
        marker: 'admin-crm-page-ready',
        markerTimeoutMs: 30_000,
      });

      await expect(page.getByTestId('admin-crm-reporting-snapshot').first()).toBeVisible();
      await expect(page.getByTestId('admin-crm-reporting-branch-pipeline').first()).toBeVisible();
      await expect(page.getByTestId('admin-crm-reporting-source-breakdown').first()).toBeVisible();
      await expect(page.getByTestId('admin-crm-forecast-alert-band').first()).toBeVisible();
      await expect(
        page.getByTestId('admin-crm-forecast-backfill-operator-form').first()
      ).toBeVisible();
      await expectCrmVisualBaseline(page, 'admin-crm-page-ready', 'admin-crm-reporting-ops.png');
    });

    test('admin CRM branch-manager baseline @crm-visual-ks-sq', async ({
      page,
      loginAs,
    }, testInfo) => {
      await loginAs('branch_manager');
      await gotoApp(page, adminCrmRoute(testInfo), testInfo, {
        marker: 'admin-crm-page-ready',
        markerTimeoutMs: 30_000,
      });

      await expect(page.getByTestId('branch-manager-crm-reporting-snapshot').first()).toBeVisible();
      await expect(
        page.getByTestId('branch-manager-crm-reporting-branch-pipeline').first()
      ).toBeVisible();
      await expect(
        page.getByTestId('branch-manager-crm-reporting-source-breakdown').first()
      ).toBeVisible();
      await expect(page.getByTestId('admin-crm-forecast-alert-band')).toHaveCount(0);
      await expect(page.getByTestId('admin-crm-forecast-observability-summary')).toHaveCount(0);
      await expect(page.getByTestId('admin-crm-forecast-backfill-operator-form')).toHaveCount(0);
      await expectCrmVisualBaseline(
        page,
        'admin-crm-page-ready',
        'admin-crm-branch-manager-reporting.png'
      );
    });
  });

  test.describe('MK/MK role baselines', () => {
    test('staff CRM reporting baseline @crm-visual-mk-mk', async ({ page, loginAs }, testInfo) => {
      await loginAs('staff');
      await gotoApp(page, staffCrmRoute(testInfo), testInfo, {
        marker: 'staff-crm-page-ready',
        markerTimeoutMs: 30_000,
      });

      await expect(page.getByTestId('staff-crm-reporting-pipeline-workload').first()).toBeVisible();
      await expect(page.getByTestId('staff-crm-reporting-funnel-movement').first()).toBeVisible();
      await expect(page.getByTestId('staff-crm-reporting-stage-velocity').first()).toBeVisible();
      await expectCrmVisualBaseline(page, 'staff-crm-page-ready', 'staff-crm-reporting.png');
    });
  });
});
