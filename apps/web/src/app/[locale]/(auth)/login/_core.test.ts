import { describe, expect, it, vi } from 'vitest';

import { loadTenantOptions } from './_core';

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
});
