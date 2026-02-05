import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

const canonicalCases = [
  {
    role: 'member' as const,
    target: (info: Parameters<typeof routes.member>[0]) => routes.member(info),
    marker: 'member-dashboard-ready',
  },
  {
    role: 'agent' as const,
    target: (info: Parameters<typeof routes.agentMembers>[0]) => routes.agentMembers(info),
    marker: 'agent-members-ready',
  },
  {
    role: 'staff' as const,
    target: (info: Parameters<typeof routes.staffClaims>[0]) => routes.staffClaims(info),
    marker: 'staff-page-ready',
  },
  {
    role: 'admin' as const,
    target: (info: Parameters<typeof routes.admin>[0]) => routes.admin(info),
    marker: 'admin-page-ready',
  },
];

test.describe('V3 Canonical Landing', () => {
  for (const scenario of canonicalCases) {
    test(`${scenario.role} lands on canonical route`, async ({ page, loginAs }, testInfo) => {
      await loginAs(scenario.role);

      const target = scenario.target(testInfo);
      await gotoApp(page, routes.login(testInfo), testInfo, { marker: scenario.marker });

      await expect(page).toHaveURL(new RegExp(`${target}$`));
      await expect(page.getByTestId(scenario.marker)).toBeVisible();

      if (scenario.role === 'agent') {
        await expect(page.getByTestId('dashboard-page-ready')).toBeVisible();
        await expect(page.getByTestId('legacy-banner')).toHaveCount(0);
      }
    });
  }

  test('legacy agent banner points to v3', async ({ page, loginAs }, testInfo) => {
    await loginAs('agent');

    const locale = routes.getLocale(testInfo);
    await gotoApp(page, `/${locale}/legacy/agent`, testInfo, { marker: 'legacy-banner' });

    await expect(page.getByTestId('legacy-banner')).toBeVisible();
    await expect(page.getByTestId('legacy-banner-link')).toHaveAttribute(
      'href',
      routes.agentMembers(testInfo)
    );
  });

  test('agent root redirects to canonical members list', async ({ page, loginAs }, testInfo) => {
    await loginAs('agent');

    const locale = routes.getLocale(testInfo);
    await gotoApp(page, `/${locale}/agent`, testInfo, { marker: 'agent-members-ready' });

    await expect(page).toHaveURL(new RegExp(`${routes.agentMembers(testInfo)}$`));
    await expect(page.getByTestId('agent-members-ready')).toBeVisible();
  });
});
