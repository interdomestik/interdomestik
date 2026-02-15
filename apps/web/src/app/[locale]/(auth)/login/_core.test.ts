import { describe, expect, it, vi } from 'vitest';

import { getLoginTenantBootstrapRedirect, loadTenantOptions } from './_core';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

describe('login core', () => {
  it('returns empty tenant options when tenant is pre-resolved', async () => {
    const loadTenants = vi.fn().mockResolvedValue([{ id: 't1', name: 'KS', countryCode: 'XK' }]);

    const result = await loadTenantOptions({
      resolvedTenantId: 'tenant_ks',
      loadTenants,
    });

    expect(result).toEqual([]);
    expect(loadTenants).not.toHaveBeenCalled();
  });

  it('returns empty tenant options when tenant load throws', async () => {
    const loadTenants = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await loadTenantOptions({
      resolvedTenantId: null,
      loadTenants,
    });

    expect(result).toEqual([]);
  });

  it('returns bootstrap redirect when query tenant is valid but context tenant is missing', () => {
    const result = getLoginTenantBootstrapRedirect({
      locale: 'sq',
      tenantIdFromQuery: 'tenant_mk',
      tenantIdFromContext: null,
    });

    expect(result).toBe('/sq/login/tenant-context?tenantId=tenant_mk&next=%2Fsq%2Flogin');
  });

  it('returns null when query tenant matches current context tenant', () => {
    const result = getLoginTenantBootstrapRedirect({
      locale: 'sq',
      tenantIdFromQuery: 'tenant_mk',
      tenantIdFromContext: 'tenant_mk',
    });

    expect(result).toBeNull();
  });

  it('returns null when query tenant is invalid', () => {
    const result = getLoginTenantBootstrapRedirect({
      locale: 'sq',
      tenantIdFromQuery: 'invalid',
      tenantIdFromContext: null,
    });

    expect(result).toBeNull();
  });
});
