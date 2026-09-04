import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Unified member portal agent consumer', () => {
  test('agent role consumes the member portal without coupling to the agent dashboard', async ({
    agentPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

    const portal = page.getByTestId('member-dashboard-ready');
    const regions = portal.locator('section[aria-label]');
    await expect(regions).toHaveCount(3);
    await expect(regions.nth(1).getByRole('link')).toHaveAttribute(
      'href',
      routes.memberNewClaim(testInfo)
    );
    const navigation = portal.getByRole('navigation');
    await expect(navigation.locator('a').nth(0)).toHaveAttribute(
      'href',
      new RegExp(`/${routes.getLocale(testInfo)}/help-now$`)
    );
    await expect(navigation.locator('a').nth(1)).toHaveAttribute(
      'href',
      new RegExp(`${routes.member(testInfo)}/claims$`)
    );
  });
});
