import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Member Dashboard (Empty State)', () => {
  test('Member with no claims sees empty state and start CTA', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginAs('member_empty');

    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'dashboard-page-ready' });

    await expect(page.getByTestId('member-empty-state')).toBeVisible();
    await expect(page.getByTestId('member-claims-list')).toHaveCount(0);
    await expect(page.getByTestId('member-active-claim')).toHaveCount(0);

    const cta = page.getByTestId('member-primary-actions').getByTestId('member-start-claim-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', new RegExp(`${routes.memberNewClaim(testInfo)}$`));
  });
});
