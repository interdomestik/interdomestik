import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('C0.5: Staff Clarity Hardening', () => {
  test('staff canonical route shows v3 readiness marker and no legacy banner', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginAs('staff');
    const target = routes.staffClaims(testInfo);

    // Canonical route check
    await gotoApp(page, target, testInfo, { marker: 'staff-page-ready' });
    await expect(page).toHaveURL(new RegExp(`${target}$`));

    // V3 Markers check
    await expect(page.getByTestId('staff-page-ready')).toBeVisible();
    await expect(page.getByTestId('portal-surface-indicator')).toBeVisible();

    // No Legacy Banner check
    await expect(page.getByTestId('legacy-banner')).toHaveCount(0);
  });

  test('staff legacy route shows legacy banner', async ({ page, loginAs }, testInfo) => {
    await loginAs('staff');
    const locale = routes.getLocale(testInfo);
    const legacyPath = `/${locale}/legacy/staff`;

    // Legacy route check
    await gotoApp(page, legacyPath, testInfo, { marker: 'legacy-surface-ready' });
    await expect(page.getByTestId('legacy-banner')).toBeVisible();

    // Ensure link points to canonical
    await expect(page.getByTestId('legacy-banner-link')).toHaveAttribute(
      'href',
      routes.staffClaims(testInfo)
    );
  });
});
