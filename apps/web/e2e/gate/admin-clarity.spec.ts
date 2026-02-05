import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('C0.5: Admin Clarity Hardening', () => {
  test('admin canonical route shows v3 readiness marker and no legacy banner', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginAs('admin');
    const target = routes.admin(testInfo);

    // Canonical route check
    await gotoApp(page, target, testInfo, { marker: 'admin-page-ready' });
    await expect(page).toHaveURL(new RegExp(`${target}$`));

    // V3 Markers check
    await expect(page.getByTestId('admin-page-ready')).toBeVisible();
    await expect(page.getByTestId('portal-surface-indicator')).toBeVisible();

    // No Legacy Banner check
    await expect(page.getByTestId('legacy-banner')).toHaveCount(0);
  });

  test('admin legacy route shows legacy banner', async ({ page, loginAs }, testInfo) => {
    await loginAs('admin');
    const locale = routes.getLocale(testInfo);
    const legacyPath = `/${locale}/legacy/admin`;

    // Legacy route check
    await gotoApp(page, legacyPath, testInfo, { marker: 'legacy-surface-ready' });
    await expect(page.getByTestId('legacy-banner')).toBeVisible();

    // Ensure link points to canonical
    await expect(page.getByTestId('legacy-banner-link')).toHaveAttribute(
      'href',
      routes.admin(testInfo)
    );
  });
});
