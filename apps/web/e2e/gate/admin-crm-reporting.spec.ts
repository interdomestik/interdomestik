import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

function adminCrmRoute(testInfo: Parameters<typeof routes.getLocale>[0]) {
  return `/${routes.getLocale(testInfo)}/admin/crm`;
}

test.describe('Admin CRM reporting role paths', () => {
  test('admin session reaches tenant-wide CRM reporting markers', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginAs('admin');
    await gotoApp(page, adminCrmRoute(testInfo), testInfo, { marker: 'admin-crm-page-ready' });

    await expect(page.getByTestId('admin-crm-page-ready').first()).toBeVisible();
    await expect(page.getByTestId('admin-crm-reporting-snapshot').first()).toBeVisible();
    await expect(page.getByTestId('admin-crm-reporting-branch-pipeline').first()).toBeVisible();
    await expect(page.getByTestId('admin-crm-reporting-source-breakdown').first()).toBeVisible();
    await expect(
      page.getByTestId('admin-crm-forecast-observability-summary').first()
    ).toBeVisible();
    await expect(
      page.getByTestId('admin-crm-forecast-observability-coverage').first()
    ).toBeVisible();
    await expect(
      page.getByTestId('admin-crm-forecast-observability-batches').first()
    ).toBeVisible();
  });

  test('branch-manager session reaches branch-scoped CRM reporting markers', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginAs('branch_manager');
    await gotoApp(page, adminCrmRoute(testInfo), testInfo, { marker: 'admin-crm-page-ready' });

    await expect(page.getByTestId('admin-crm-page-ready').first()).toBeVisible();
    await expect(page.getByTestId('branch-manager-crm-reporting-snapshot').first()).toBeVisible();
    await expect(
      page.getByTestId('branch-manager-crm-reporting-branch-pipeline').first()
    ).toBeVisible();
    await expect(
      page.getByTestId('branch-manager-crm-reporting-source-breakdown').first()
    ).toBeVisible();
    await expect(page.getByTestId('admin-crm-forecast-observability-summary')).toHaveCount(0);
    await expect(page.getByTestId('admin-crm-forecast-observability-coverage')).toHaveCount(0);
    await expect(page.getByTestId('admin-crm-forecast-observability-batches')).toHaveCount(0);
  });
});
