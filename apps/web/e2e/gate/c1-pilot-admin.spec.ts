import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('C1-01: Admin Initialization', () => {
  test('Tenant Admin can access /admin but not /member', async ({ page, loginAs }, testInfo) => {
    await loginAs('admin');

    const adminRoute = routes.admin(testInfo);
    await gotoApp(page, adminRoute, testInfo, { marker: 'admin-page-ready' });
    await expect(page).toHaveURL(new RegExp(`${adminRoute}$`));
    await expect(page.getByTestId('admin-page-ready')).toBeVisible();
    await expect(page.getByTestId('portal-surface-indicator')).toBeVisible();

    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'body' });
    await expect(page).not.toHaveURL(new RegExp(`${routes.member(testInfo)}$`));
  });
});
