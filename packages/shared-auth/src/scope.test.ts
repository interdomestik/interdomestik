import { describe, expect, it } from 'vitest';

import { MissingTenantError } from './errors';
import { ROLES } from './permissions';
import { ensureAccessTenantId, type SessionWithTenant } from './session';
import { scopeFilter } from './scope';

function session(role: string, tenantId?: string, accessTenantId?: string): SessionWithTenant {
  return {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      role,
      ...(tenantId ? { tenantId } : {}),
      ...(accessTenantId ? { accessTenantId } : {}),
    },
  } as SessionWithTenant;
}

describe('scopeFilter', () => {
  it('allows global support to read an explicitly selected tenant', () => {
    expect(scopeFilter(session(ROLES.global_support, 'tenant-1'))).toEqual({
      tenantId: 'tenant-1',
      accessTenantId: 'tenant-1',
      isFullTenantScope: true,
      isCrossTenantScope: false,
    });
  });

  it('allows auditor to read an explicitly selected tenant', () => {
    expect(scopeFilter(session(ROLES.auditor, 'tenant-1'))).toEqual({
      tenantId: 'tenant-1',
      accessTenantId: 'tenant-1',
      isFullTenantScope: true,
      isCrossTenantScope: false,
    });
  });

  it('uses accessTenantId instead of generic or legal tenant concepts for isolation', () => {
    const scopedSession = {
      user: {
        id: 'user-1',
        role: ROLES.staff,
        tenantId: 'tenant_legal_compat',
        accessTenantId: 'tenant_access',
        bookingTenantId: 'tenant_booking',
        legalTenantId: 'tenant_legal',
        recoveryLegalTenantId: 'tenant_recovery',
        hostTenantId: 'tenant_host',
      },
    } satisfies SessionWithTenant;

    expect(ensureAccessTenantId(scopedSession)).toBe('tenant_access');
    expect(scopeFilter(scopedSession)).toEqual({
      tenantId: 'tenant_access',
      accessTenantId: 'tenant_access',
      isFullTenantScope: true,
      isCrossTenantScope: false,
    });
  });

  it('keeps global support scoped to access tenant without changing legal entity', () => {
    const scopedSession = {
      user: {
        id: 'support-1',
        role: ROLES.global_support,
        tenantId: 'tenant_legal_compat',
        accessTenantId: 'tenant_access',
        legalTenantId: 'tenant_legal',
      },
    } satisfies SessionWithTenant;

    expect(scopeFilter(scopedSession)).toEqual({
      tenantId: 'tenant_access',
      accessTenantId: 'tenant_access',
      isFullTenantScope: true,
      isCrossTenantScope: false,
    });
    expect(scopedSession.user.legalTenantId).toBe('tenant_legal');
  });

  it('falls back to tenantId when accessTenantId is blank', () => {
    const scopedSession = {
      user: {
        id: 'user-1',
        role: ROLES.staff,
        tenantId: 'tenant_access',
        accessTenantId: '',
      },
    } satisfies SessionWithTenant;

    expect(ensureAccessTenantId(scopedSession)).toBe('tenant_access');
    expect(scopeFilter(scopedSession).accessTenantId).toBe('tenant_access');
  });

  it('requires tenant context for non-super-admin roles', () => {
    expect(() => scopeFilter(session(ROLES.staff))).toThrow(MissingTenantError);
    expect(() => scopeFilter(session(ROLES.global_support))).toThrow(MissingTenantError);
    expect(() => scopeFilter(session(ROLES.auditor))).toThrow(MissingTenantError);
  });
});
