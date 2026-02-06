import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Admin Overview MVP', () => {
  test('seeded admin sees overview KPIs and non-zero activity', async ({
    adminPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.admin(testInfo), testInfo, {
      marker: 'admin-page-ready',
    });

    await expect(page.getByTestId('admin-page-ready')).toBeVisible();
    await expect(page.getByTestId('admin-overview-kpis')).toBeVisible();

    const kpiCards = [
      page.getByTestId('admin-overview-kpi-members'),
      page.getByTestId('admin-overview-kpi-agents'),
      page.getByTestId('admin-overview-kpi-active-claims'),
      page.getByTestId('admin-overview-kpi-updated-24h'),
    ];

    for (const card of kpiCards) {
      await expect(card).toBeVisible();
    }

    const values = await Promise.all(
      kpiCards.map(async card => {
        const text = await card.innerText();
        const match = text.match(/\d+/);
        return Number(match?.[0] ?? 0);
      })
    );

    expect(values.some(value => value > 0)).toBeTruthy();
  });
});
