import { describe, expect, it } from 'vitest';

import { MissingTenantError } from './errors';
import { ROLES } from './permissions';
import { scopeFilter } from './scope';
import type { SessionWithTenant } from './session';

function session(role: string, tenantId?: string): SessionWithTenant {
  return {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      role,
      ...(tenantId ? { tenantId } : {}),
    },
  } as SessionWithTenant;
}

describe('scopeFilter', () => {
  it('allows global support to read an explicitly selected tenant', () => {
    expect(scopeFilter(session(ROLES.global_support, 'tenant-1'))).toEqual({
      tenantId: 'tenant-1',
      isFullTenantScope: true,
      isCrossTenantScope: false,
    });
  });

  it('allows auditor to read an explicitly selected tenant', () => {
    expect(scopeFilter(session(ROLES.auditor, 'tenant-1'))).toEqual({
      tenantId: 'tenant-1',
      isFullTenantScope: true,
      isCrossTenantScope: false,
    });
  });

  it('requires tenant context for non-super-admin roles', () => {
    expect(() => scopeFilter(session(ROLES.staff))).toThrow(MissingTenantError);
    expect(() => scopeFilter(session(ROLES.global_support))).toThrow(MissingTenantError);
    expect(() => scopeFilter(session(ROLES.auditor))).toThrow(MissingTenantError);
  });
});
