import { describe, expect, it } from 'vitest';

import {
  getRolePermissions,
  isStaffOrHigher,
  isTenantAdmin,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  type Permission,
} from './permissions';

function sortedPermissions(permissions: readonly Permission[]): Permission[] {
  return [...permissions].sort((left, right) => left.localeCompare(right));
}

describe('ROLE_PERMISSIONS', () => {
  it('covers every declared role exactly once', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort((left, right) => left.localeCompare(right))).toEqual(
      Object.values(ROLES).sort((left, right) => left.localeCompare(right))
    );

    for (const role of Object.values(ROLES)) {
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
    }
  });

  it('contains only declared permission values', () => {
    const declaredPermissions = new Set(Object.values(PERMISSIONS));

    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(declaredPermissions.has(permission)).toBe(true);
      }
    }
  });

  it('exports immutable role permission arrays', () => {
    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);

    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      expect(Object.isFrozen(permissions)).toBe(true);
    }
  });

  it('keeps admin and tenant_admin distinct from super_admin', () => {
    const superAdminPermissions = sortedPermissions(getRolePermissions(ROLES.super_admin));

    expect(superAdminPermissions).toEqual(
      sortedPermissions([
        PERMISSIONS['members.read'],
        PERMISSIONS['members.write'],
        PERMISSIONS['claims.read'],
        PERMISSIONS['claims.update'],
        PERMISSIONS['claims.assign'],
        PERMISSIONS['roles.manage'],
        PERMISSIONS['branches.manage'],
        PERMISSIONS['analytics.read'],
        PERMISSIONS['settings.manage'],
        PERMISSIONS['tenants.manage'],
        PERMISSIONS['support.cross_tenant_read'],
        PERMISSIONS['audit.read'],
        PERMISSIONS['break_glass.use'],
      ])
    );

    for (const role of [ROLES.admin, ROLES.tenant_admin]) {
      const permissions = sortedPermissions(getRolePermissions(role));

      expect(permissions).not.toEqual(superAdminPermissions);
      expect(permissions).not.toContain(PERMISSIONS['tenants.manage']);
      expect(permissions).not.toContain(PERMISSIONS['break_glass.use']);
      expect(permissions).toContain(PERMISSIONS['governance.approve']);
    }
  });

  it('keeps global support and auditor read-only', () => {
    const mutationPermissions = [
      PERMISSIONS['members.write'],
      PERMISSIONS['claims.update'],
      PERMISSIONS['claims.assign'],
      PERMISSIONS['roles.manage'],
      PERMISSIONS['branches.manage'],
      PERMISSIONS['settings.manage'],
      PERMISSIONS['tenants.manage'],
      PERMISSIONS['governance.approve'],
    ];

    expect(getRolePermissions(ROLES.global_support)).toEqual([
      PERMISSIONS['members.read'],
      PERMISSIONS['claims.read'],
      PERMISSIONS['analytics.read'],
      PERMISSIONS['support.cross_tenant_read'],
    ]);
    expect(getRolePermissions(ROLES.auditor)).toEqual([
      PERMISSIONS['analytics.read'],
      PERMISSIONS['audit.read'],
    ]);

    for (const role of [ROLES.global_support, ROLES.auditor]) {
      for (const permission of mutationPermissions) {
        expect(getRolePermissions(role)).not.toContain(permission);
      }
    }
  });

  it('treats admin and tenant_admin as tenant-level administrators', () => {
    expect(isTenantAdmin(ROLES.admin)).toBe(true);
    expect(isTenantAdmin(ROLES.tenant_admin)).toBe(true);
    expect(isTenantAdmin(ROLES.super_admin)).toBe(false);
    expect(isTenantAdmin(ROLES.global_support)).toBe(false);
    expect(isTenantAdmin(ROLES.auditor)).toBe(false);
    expect(isTenantAdmin(ROLES.staff)).toBe(false);
  });

  it('does not treat support or auditor roles as staff-or-higher operators', () => {
    expect(isStaffOrHigher(ROLES.global_support)).toBe(false);
    expect(isStaffOrHigher(ROLES.auditor)).toBe(false);
    expect(isStaffOrHigher(ROLES.staff)).toBe(true);
  });
});
