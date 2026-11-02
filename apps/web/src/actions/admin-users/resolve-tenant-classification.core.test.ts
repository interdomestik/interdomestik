import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  delegateSuperAdminTenant: vi.fn(),
  resolveTenantClassificationDomain: vi.fn(),
  revalidatePath: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('@interdomestik/domain-users/admin/resolve-tenant-classification', () => ({
  resolveTenantClassificationCore: (...args: unknown[]) =>
    mocks.resolveTenantClassificationDomain(...args),
}));

vi.mock('@interdomestik/database', () => ({
  delegateSuperAdminTenant: (...args: unknown[]) => mocks.delegateSuperAdminTenant(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: (...args: unknown[]) => mocks.logAuditEvent(...args),
}));

import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

import { resolveTenantClassificationCore } from './resolve-tenant-classification.core';

const authorities = new Map<string, ReturnType<typeof mintTestTenantAuthority>>();
function authorityFor(tenantId: string) {
  const existing = authorities.get(tenantId);
  if (existing) return existing;
  const minted = mintTestTenantAuthority(tenantId);
  authorities.set(tenantId, minted);
  return minted;
}

describe('resolveTenantClassificationCore wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revalidates admin user views and records an audit event on confirm', async () => {
    mocks.resolveTenantClassificationDomain.mockResolvedValue({
      success: true,
      data: {
        previousTenantId: 'tenant_ks',
        tenantId: 'tenant_ks',
        previousPending: true,
        tenantClassificationPending: false,
        resolutionMode: 'confirm_current',
      },
    });

    const result = await resolveTenantClassificationCore({
      session: { user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' } } as never,
      authority: authorityFor('tenant_ks'),
      userId: 'member-1',
      currentTenantId: 'tenant_ks',
      nextTenantId: null,
    });

    expect(result).toEqual({
      success: true,
      data: {
        previousTenantId: 'tenant_ks',
        tenantId: 'tenant_ks',
        previousPending: true,
        tenantClassificationPending: false,
        resolutionMode: 'confirm_current',
      },
    });
    expect(mocks.resolveTenantClassificationDomain).toHaveBeenCalledWith({
      session: { user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' } },
      authority: authorityFor('tenant_ks'),
      userId: 'member-1',
      currentTenantId: 'tenant_ks',
      targetTenantId: null,
    });
    // Opaque tokens deep-compare as {}; the exact wrapper token must reach the domain.
    expect(mocks.resolveTenantClassificationDomain.mock.calls[0][0].authority).toBe(
      authorityFor('tenant_ks')
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/users');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/users/member-1');
    expect(mocks.logAuditEvent.mock.calls[0]?.[0].authority).toBe(authorityFor('tenant_ks'));
    expect(mocks.logAuditEvent).toHaveBeenCalledWith({
      actorId: 'admin-1',
      actorRole: 'tenant_admin',
      authority: authorityFor('tenant_ks'),
      action: 'user.tenant_classification_confirmed',
      entityType: 'user',
      entityId: 'member-1',
      metadata: {
        previousTenantId: 'tenant_ks',
        tenantId: 'tenant_ks',
        previousPending: true,
        tenantClassificationPending: false,
        resolutionMode: 'confirm_current',
      },
    });
  });

  it('records a reassign audit event when the tenant changes', async () => {
    mocks.resolveTenantClassificationDomain.mockResolvedValue({
      success: true,
      data: {
        previousTenantId: 'tenant_ks',
        tenantId: 'tenant_mk',
        previousPending: true,
        tenantClassificationPending: false,
        resolutionMode: 'reassign',
      },
    });

    const result = await resolveTenantClassificationCore({
      session: { user: { id: 'super-1', role: 'super_admin', tenantId: 'tenant_ks' } } as never,
      authority: authorityFor('tenant_ks'),
      userId: 'member-1',
      currentTenantId: 'tenant_ks',
      nextTenantId: 'tenant_mk',
    });

    expect(result).toEqual({
      success: true,
      data: {
        previousTenantId: 'tenant_ks',
        tenantId: 'tenant_mk',
        previousPending: true,
        tenantClassificationPending: false,
        resolutionMode: 'reassign',
      },
    });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith({
      actorId: 'super-1',
      actorRole: 'super_admin',
      authority: authorityFor('tenant_ks'),
      action: 'user.tenant_reassigned',
      entityType: 'user',
      entityId: 'member-1',
      metadata: {
        previousTenantId: 'tenant_ks',
        tenantId: 'tenant_mk',
        previousPending: true,
        tenantClassificationPending: false,
        resolutionMode: 'reassign',
      },
    });
  });

  it('does not revalidate or audit on error', async () => {
    mocks.resolveTenantClassificationDomain.mockResolvedValue({
      error: 'Cannot reassign tenant classification while tenant-bound records exist',
    });

    const result = await resolveTenantClassificationCore({
      session: { user: { id: 'super-1', role: 'super_admin', tenantId: 'tenant_ks' } } as never,
      authority: authorityFor('tenant_ks'),
      userId: 'member-1',
      currentTenantId: 'tenant_ks',
      nextTenantId: 'tenant_mk',
    });

    expect(result).toEqual({
      error: 'Cannot reassign tenant classification while tenant-bound records exist',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('audits a super_admin confirmation of another tenant under the delegated authority', async () => {
    const delegated = mintTestTenantAuthority('tenant_mk');
    mocks.delegateSuperAdminTenant.mockResolvedValue(delegated);
    mocks.resolveTenantClassificationDomain.mockResolvedValue({
      success: true,
      data: {
        previousTenantId: 'tenant_mk',
        tenantId: 'tenant_mk',
        previousPending: true,
        tenantClassificationPending: false,
        resolutionMode: 'confirm_current',
      },
    });

    await resolveTenantClassificationCore({
      session: { user: { id: 'super-1', role: 'super_admin', tenantId: 'tenant_ks' } } as never,
      authority: authorityFor('tenant_ks'),
      userId: 'member-1',
      currentTenantId: 'tenant_mk',
      nextTenantId: null,
    });

    expect(mocks.delegateSuperAdminTenant).toHaveBeenCalledWith(
      authorityFor('tenant_ks'),
      'tenant_mk'
    );
    expect(mocks.logAuditEvent.mock.calls[0]?.[0].authority).toBe(delegated);
  });

  it('writes no audit row when a non-super_admin names another tenant than its authority', async () => {
    mocks.resolveTenantClassificationDomain.mockResolvedValue({
      success: true,
      data: {
        previousTenantId: 'tenant_mk',
        tenantId: 'tenant_mk',
        previousPending: true,
        tenantClassificationPending: false,
        resolutionMode: 'confirm_current',
      },
    });

    await resolveTenantClassificationCore({
      session: { user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' } } as never,
      authority: authorityFor('tenant_ks'),
      userId: 'member-1',
      currentTenantId: 'tenant_mk',
      nextTenantId: null,
    });

    expect(mocks.delegateSuperAdminTenant).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
