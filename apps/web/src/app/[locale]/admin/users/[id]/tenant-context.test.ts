import { describe, expect, it } from 'vitest';
import { buildTenantAwareUserProfilePath, hasTenantContext } from './tenant-context';

describe('tenant-context helpers', () => {
  it('detects tenantId in search params', () => {
    expect(hasTenantContext({ tenantId: 'tenant_ks' })).toBe(true);
    expect(hasTenantContext({ tenantId: ['tenant_ks'] })).toBe(true);
    expect(hasTenantContext({ tenantId: '' })).toBe(false);
    expect(hasTenantContext({})).toBe(false);
  });

  it('builds profile path preserving current params and injecting tenantId', () => {
    const href = buildTenantAwareUserProfilePath({
      locale: 'sq',
      userId: 'user-1',
      searchParams: {
        role: 'agent',
        page: '2',
      },
      tenantId: 'tenant_ks',
    });

    const url = new URL(href, 'https://example.com');
    expect(url.pathname).toBe('/sq/admin/users/user-1');
    expect(url.searchParams.get('tenantId')).toBe('tenant_ks');
    expect(url.searchParams.get('role')).toBe('agent');
    expect(url.searchParams.get('page')).toBe('2');
  });
});
