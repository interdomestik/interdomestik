import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveTenantClassificationCore: vi.fn(),
}));

vi.mock('@/lib/safe-action', () => ({
  runAuthenticatedAction: async (callback: (ctx: { session: unknown }) => unknown) => {
    try {
      await callback({
        session: { user: { id: 'admin-1', role: 'admin', tenantId: 't1' } },
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: String(error instanceof Error ? error.message : error),
      };
    }
  },
}));

vi.mock('@/server/auth/effective-portal-access', () => ({
  requireEffectivePortalAccessOrUnauthorized: vi.fn(async () => undefined),
}));

vi.mock('./admin-users/resolve-tenant-classification.core', () => ({
  resolveTenantClassificationCore: (...args: unknown[]) =>
    mocks.resolveTenantClassificationCore(...args),
}));

import { resolveTenantClassification } from './admin-users.core';

describe('resolveTenantClassification', () => {
  it('delegates confirm-current resolution with a null target tenant', async () => {
    mocks.resolveTenantClassificationCore.mockResolvedValue({
      success: true,
      data: {
        previousTenantId: 'tenant_ks',
        tenantId: 'tenant_ks',
        previousPending: true,
        tenantClassificationPending: false,
        resolutionMode: 'confirm_current',
      },
    });

    const result = await resolveTenantClassification({
      userId: 'user-1',
      currentTenantId: 'tenant_ks',
    });

    expect(mocks.resolveTenantClassificationCore).toHaveBeenCalledWith({
      session: { user: { id: 'admin-1', role: 'admin', tenantId: 't1' } },
      userId: 'user-1',
      currentTenantId: 'tenant_ks',
      nextTenantId: null,
    });
    expect(result).toEqual({ success: true });
  });

  it('delegates a tenant reassignment and surfaces the domain error', async () => {
    mocks.resolveTenantClassificationCore.mockResolvedValue({
      error: 'Cannot reassign tenant classification while tenant-bound records exist',
    });

    const result = await resolveTenantClassification({
      userId: 'user-1',
      currentTenantId: 'tenant_ks',
      nextTenantId: 'tenant_mk',
    });

    expect(mocks.resolveTenantClassificationCore).toHaveBeenCalledWith({
      session: { user: { id: 'admin-1', role: 'admin', tenantId: 't1' } },
      userId: 'user-1',
      currentTenantId: 'tenant_ks',
      nextTenantId: 'tenant_mk',
    });
    expect(result).toEqual({
      success: false,
      error: 'Cannot reassign tenant classification while tenant-bound records exist',
    });
  });
});
