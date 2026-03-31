import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveTenantClassificationDomain: vi.fn(),
  revalidatePath: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('@interdomestik/domain-users/admin/resolve-tenant-classification', () => ({
  resolveTenantClassificationCore: (...args: unknown[]) =>
    mocks.resolveTenantClassificationDomain(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: (...args: unknown[]) => mocks.logAuditEvent(...args),
}));

import { resolveTenantClassificationCore } from './resolve-tenant-classification.core';

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
      userId: 'member-1',
      currentTenantId: 'tenant_ks',
      targetTenantId: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/users');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/users/member-1');
    expect(mocks.logAuditEvent).toHaveBeenCalledWith({
      actorId: 'admin-1',
      actorRole: 'tenant_admin',
      tenantId: 'tenant_ks',
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
      tenantId: 'tenant_ks',
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
});
