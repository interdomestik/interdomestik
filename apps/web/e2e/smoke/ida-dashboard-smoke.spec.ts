import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

type SmokeRole = 'member' | 'admin' | 'agent' | 'staff';

const canonicalDashboardCases: Array<{
  role: SmokeRole;
  route: (input: Parameters<typeof routes.member>[0]) => string;
  marker: string;
}> = [
  {
    role: 'member',
    route: routes.member,
    marker: 'member-dashboard-ready',
  },
  {
    role: 'admin',
    route: routes.admin,
    marker: 'admin-page-ready',
  },
  {
    role: 'agent',
    route: routes.agentMembers,
    marker: 'agent-members-ready',
  },
  {
    role: 'staff',
    route: routes.staffClaims,
    marker: 'staff-page-ready',
  },
];

function assertNoHostTenantContext(
  responseHeaders: Record<string, string>,
  origin: string,
  cookies: Array<{ name: string }>
) {
  expect(responseHeaders['x-e2e-tenant']).toBe('none');
  expect(responseHeaders['x-e2e-tenant-context']).toBe('public');
  expect(cookies.find(cookie => cookie.name === 'tenantId')).toBeUndefined();
  expect(new URL(origin).hostname.startsWith('ida.')).toBe(true);
}

test.describe('@smoke ida.localhost canonical dashboard smoke', () => {
  for (const scenario of canonicalDashboardCases) {
    test(`${scenario.role} dashboard resolves session context without host tenant`, async ({
      page,
      loginAs,
    }, testInfo) => {
      const baseURL = testInfo.project.use.baseURL?.toString();
      const projectHeaders = testInfo.project.use.extraHTTPHeaders ?? {};
      if (!baseURL) throw new Error('smoke-ida requires project.use.baseURL');

      const origin = new URL(baseURL).origin;
      const forwardedHostHeader = ['x-forwarded', 'host'].join('-');
      if (!new URL(origin).hostname.startsWith('ida.')) {
        test.skip(true, 'ida dashboard smoke only runs in canonical ida projects');
        return;
      }

      expect(projectHeaders[forwardedHostHeader]).toBeUndefined();
      expect(projectHeaders['x-tenant-id']).toBe('tenant_ks');

      await loginAs(scenario.role);

      const response = await gotoApp(page, scenario.route(testInfo), testInfo, {
        marker: scenario.marker,
        markerTimeoutMs: 30_000,
      });

      assertNoHostTenantContext(
        response?.headers() ?? {},
        origin,
        await page.context().cookies(origin)
      );
      await expect(page.getByTestId(scenario.marker).first()).toBeVisible();
      await expect(
        page
          .locator(
            [
              '[data-testid="portal-surface-indicator"]',
              '[data-testid="sidebar-user-menu-button"]',
              '[data-testid="user-nav"]',
            ].join(',')
          )
          .first()
      ).toBeVisible();
      await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);
      await expect(page.getByTestId('legacy-banner')).toHaveCount(0);
      await expect(page.getByTestId('legacy-surface-ready')).toHaveCount(0);
    });
  }
});
