import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Member Overlay', () => {
  test('Agent opens own member portal', async ({ agentPage: page }, testInfo) => {
    await gotoApp(page, routes.agent(testInfo), testInfo, { marker: 'dashboard-page-ready' });

    const cta = page.getByTestId('agent-member-dashboard-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', new RegExp(`${routes.member(testInfo)}$`));

    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'dashboard-page-ready' });
    const portal = page.getByTestId('member-dashboard-ready');
    const regions = portal.locator('section[aria-label]');
    await expect(regions).toHaveCount(3);
    await expect(regions.nth(0).getByRole('status')).toBeVisible();
    // prettier-ignore
    await expect(regions.nth(1).getByRole('link')).toHaveAttribute('href', routes.memberNewClaim(testInfo));
    await expect(regions.nth(2).getByRole('status')).toBeVisible();
    await expect(portal.getByRole('navigation').locator('a')).toHaveCount(4);
  });
});
