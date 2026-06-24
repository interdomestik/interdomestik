import { describe, expect, it } from 'vitest';

import { resolveLoginTenantHint } from './login-tenant-hint';

describe('resolveLoginTenantHint', () => {
  it('prefers explicit tenant over query hints', () => {
    const params = new URLSearchParams('tenantId=tenant_mk&default_booking_tenant_id=tenant_al');

    expect(resolveLoginTenantHint(params, 'tenant_ks')).toBe('tenant_ks');
  });

  it('uses default booking tenant as a neutral ida login hint', () => {
    const params = new URLSearchParams('default_booking_tenant_id=pilot-mk');

    expect(resolveLoginTenantHint(params)).toBe('pilot-mk');
  });

  it('rejects unsupported hints', () => {
    const params = new URLSearchParams('default_booking_tenant_id=tenant_evil');

    expect(resolveLoginTenantHint(params)).toBeUndefined();
  });
});
