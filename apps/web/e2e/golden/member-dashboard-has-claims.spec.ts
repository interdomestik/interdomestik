import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Member Dashboard (Has Claims)', () => {
  test('Member with claims sees active focus and claims list', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'dashboard-page-ready' });

    await expect(page.getByTestId('dashboard-page-ready')).toBeVisible();
    await expect(page.getByTestId('member-header')).toBeVisible();
    await expect(page.getByTestId('member-primary-actions')).toBeVisible();
    await expect(page.getByTestId('member-claims-list')).toBeVisible();
    await expect(page.getByTestId('member-support-link')).toBeVisible();
    await expect(page.getByTestId('member-active-claim')).toBeVisible();

    const cta = page.getByTestId('member-primary-actions').getByTestId('member-start-claim-cta');
    await expect(cta).toHaveAttribute('href', new RegExp(`${routes.memberNewClaim(testInfo)}$`));

    const firstClaim = page.getByTestId('member-claims-list').locator('li').first();
    await expect(firstClaim).toBeVisible();
    await expect(firstClaim).toContainText(/.+/);
  });
});
