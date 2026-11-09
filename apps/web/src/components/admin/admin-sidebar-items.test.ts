import { describe, expect, it } from 'vitest';
import { ROLES } from '@interdomestik/shared-auth';
import { adminSidebarItems } from './admin-sidebar-items';

describe('sponsor admin navigation', () => {
  it.each([ROLES.admin, ROLES.tenant_admin, ROLES.super_admin, ROLES.branch_manager])(
    'admits %s',
    role => {
      expect(
        adminSidebarItems(role, 'branch-1').some(item => item.href === '/admin/sponsors')
      ).toBe(true);
    }
  );
  it.each([ROLES.auditor, ROLES.global_support, ROLES.member, ROLES.branch_manager])(
    'refuses %s without branch authority',
    role => {
      expect(adminSidebarItems(role).some(item => item.href === '/admin/sponsors')).toBe(false);
    }
  );
});
