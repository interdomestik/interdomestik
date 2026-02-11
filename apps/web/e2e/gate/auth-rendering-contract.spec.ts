import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

test.describe('Auth Rendering Contract (Regression Protection)', () => {
  const routes = [
    { name: 'Staff', path: '/staff', marker: 'staff-page-ready' },
    { name: 'Admin', path: '/admin', marker: 'admin-page-ready' },
    { name: 'Agent', path: '/agent', marker: 'dashboard-page-ready' },
    { name: 'Member', path: '/member', marker: 'member-dashboard-ready' },
  ];

  for (const route of routes) {
    test(`should render ${route.name} portal without DYNAMIC_SERVER_USAGE errors`, async ({
      page,
      loginAs,
    }, testInfo) => {
      // Login as appropriate role if needed, but 'admin' or 'super_admin' often has broad visibility
      // or we can test role-specific if needed. For contract verification, we focus on the LAYOUT rendering.

      // Map path to generic role for login
      const role =
        route.path.replace('/', '') === 'member'
          ? 'member'
          : route.path.replace('/', '') === 'staff'
            ? 'staff'
            : route.path.replace('/', '') === 'admin'
              ? 'admin'
              : 'agent';

      await loginAs(role as 'member' | 'staff' | 'admin' | 'agent');

      const consoleMessages: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleMessages.push(msg.text());
      });

      await gotoApp(page, route.path, testInfo, { marker: route.marker });

      // Assert readiness marker
      await expect(page.getByTestId(route.marker)).toBeVisible();

      // Assert no DYNAMIC_SERVER_USAGE errors in console (if they leak to client)
      // Note: Usually these are server-side build/render errors, but we check for any critical failures.
      const hasDynamicError = consoleMessages.some(
        m => m.includes('DYNAMIC_SERVER_USAGE') || m.includes('headers used statically')
      );
      expect(
        hasDynamicError,
        `Found DYNAMIC_SERVER_USAGE error in console: ${consoleMessages.join('\n')}`
      ).toBe(false);
    });
  }
});
