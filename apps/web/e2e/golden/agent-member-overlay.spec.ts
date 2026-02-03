import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Member Overlay', () => {
  test('Agent can open their member dashboard from agent home', async ({
    agentPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.agent(testInfo), testInfo, { marker: 'dashboard-page-ready' });

    const cta = page.getByTestId('agent-member-dashboard-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', new RegExp(`${routes.member(testInfo)}$`));

    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'dashboard-page-ready' });
    await expect(page).toHaveURL(new RegExp(`${routes.member(testInfo)}$`));
    await expect(page.getByTestId('member-header')).toBeVisible();
    await expect(page.getByTestId('member-empty-state')).toBeVisible();
    await expect(page.getByTestId('member-claims-list')).toHaveCount(0);
  });
});
