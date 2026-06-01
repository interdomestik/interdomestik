import { describe, expect, it } from 'vitest';

import {
  getRolePermissions,
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

    expect(superAdminPermissions).toContain(PERMISSIONS['tenants.manage']);

    for (const role of [ROLES.admin, ROLES.tenant_admin]) {
      const permissions = sortedPermissions(getRolePermissions(role));

      expect(permissions).not.toEqual(superAdminPermissions);
      expect(permissions).not.toContain(PERMISSIONS['tenants.manage']);
    }
  });

  it('treats admin and tenant_admin as tenant-level administrators', () => {
    expect(isTenantAdmin(ROLES.admin)).toBe(true);
    expect(isTenantAdmin(ROLES.tenant_admin)).toBe(true);
    expect(isTenantAdmin(ROLES.super_admin)).toBe(true);
    expect(isTenantAdmin(ROLES.staff)).toBe(false);
  });
});
