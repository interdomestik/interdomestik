import { describe, expect, it } from 'vitest';
import { ROLES } from '@interdomestik/shared-auth';
import { adminSidebarItems } from './admin-sidebar-items';

const NO_ACCESS = { canAccessUsers: false, canReadAnalytics: false };

describe('sponsor admin navigation', () => {
  it('uses a distinct icon for every admitted destination', () => {
    const icons = adminSidebarItems(ROLES.tenant_admin, null, {
      canAccessUsers: true,
      canReadAnalytics: true,
    })
      .filter(item => !item.hidden)
      .map(item => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
  it.each([ROLES.admin, ROLES.tenant_admin, ROLES.super_admin, ROLES.branch_manager])(
    'admits %s',
    role => {
      expect(
        adminSidebarItems(role, 'branch-1', NO_ACCESS).some(item => item.href === '/admin/sponsors')
      ).toBe(true);
    }
  );
  it.each([ROLES.auditor, ROLES.global_support, ROLES.member, ROLES.branch_manager])(
    'refuses %s without branch authority',
    role => {
      expect(
        adminSidebarItems(role, null, NO_ACCESS).some(item => item.href === '/admin/sponsors')
      ).toBe(false);
    }
  );
});

describe('admin navigation capabilities', () => {
  it.each(['staff', 'agent'])(
    'shows people and analytics for %s with server-resolved admin capabilities',
    role => {
      const paths = adminSidebarItems(role, null, {
        canAccessUsers: true,
        canReadAnalytics: true,
      }).map(item => item.href);
      expect(paths).toEqual(
        expect.arrayContaining([
          '/admin/users',
          '/admin/users?role=agent',
          '/admin/users?role=admin,staff',
          '/admin/analytics',
        ])
      );
      expect(paths).not.toContain('/admin/settings');
    }
  );

  it('honors a server denial even for a primary admin role', () => {
    const items = adminSidebarItems('admin', null, {
      canAccessUsers: false,
      canReadAnalytics: false,
    });
    expect(items.filter(item => item.peopleKey)).toHaveLength(0);
    expect(items.map(item => item.href)).not.toContain('/admin/analytics');
  });

  it.each([
    ['super_admin', true, true, true],
    ['tenant_admin', true, true, false],
    ['admin', true, true, false],
    ['branch_manager', false, true, false],
  ] as const)('%s only sees admitted links', (role, people, analytics, settings) => {
    const paths = adminSidebarItems(role, 'branch-1', {
      canAccessUsers: people,
      canReadAnalytics: analytics,
    }).map(item => item.href);
    for (const href of [
      '/admin/users',
      '/admin/users?role=agent',
      '/admin/users?role=admin,staff',
    ]) {
      expect(paths.includes(href)).toBe(people);
    }
    expect(paths.includes('/admin/analytics')).toBe(analytics);
    expect(paths.includes('/admin/settings')).toBe(settings);
  });

  it.each([null, '', '   '])('hides analytics from a manager without a branch (%j)', branchId => {
    expect(
      adminSidebarItems('branch_manager', branchId, NO_ACCESS).map(item => item.href)
    ).not.toContain('/admin/analytics');
  });
});
