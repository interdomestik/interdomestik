import { describe, expect, it } from 'vitest';

import {
  isAdmin,
  isBranchManager,
  isStaffOrAdmin,
  isTenantAdmin,
  ROLE_AUDITOR,
  ROLE_ADMIN,
  ROLE_GLOBAL_SUPPORT,
  ROLE_SUPER_ADMIN,
  ROLE_TENANT_ADMIN,
} from './roles.core';

describe('roles.core boundaries', () => {
  it('keeps super_admin distinct from tenant_admin', () => {
    expect(isAdmin(ROLE_SUPER_ADMIN)).toBe(true);
    expect(isTenantAdmin(ROLE_SUPER_ADMIN)).toBe(false);
    expect(isBranchManager(ROLE_SUPER_ADMIN)).toBe(false);
  });

  it('treats admin and tenant_admin as tenant administrators', () => {
    expect(isTenantAdmin(ROLE_ADMIN)).toBe(true);
    expect(isTenantAdmin(ROLE_TENANT_ADMIN)).toBe(true);
  });

  it('does not classify global support or auditor as admin operators', () => {
    for (const role of [ROLE_GLOBAL_SUPPORT, ROLE_AUDITOR]) {
      expect(isAdmin(role)).toBe(false);
      expect(isTenantAdmin(role)).toBe(false);
      expect(isBranchManager(role)).toBe(false);
      expect(isStaffOrAdmin(role)).toBe(false);
    }
  });
});
