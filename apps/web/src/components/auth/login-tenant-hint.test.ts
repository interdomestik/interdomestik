import { describe, expect, it } from 'vitest';

import { resolveLoginTenantHint, resolveSocialOnboardingTenantContext } from './login-tenant-hint';

describe('resolveLoginTenantHint', () => {
  it('prefers the page-resolved tenant over an explicit query hint', () => {
    const params = new URLSearchParams('tenantId=tenant_mk&default_booking_tenant_id=tenant_al');

    expect(resolveLoginTenantHint(params, 'tenant_ks')).toBe('tenant_ks');
  });

  it('keeps a deliberate tenantId request as explicit login context', () => {
    const params = new URLSearchParams('tenantId=tenant_mk');

    expect(resolveLoginTenantHint(params)).toBe('tenant_mk');
  });

  it('does not promote booking context into identity selection', () => {
    const params = new URLSearchParams('default_booking_tenant_id=pilot-mk');

    expect(resolveLoginTenantHint(params)).toBeUndefined();
  });

  it('ignores booking context even when it would be a valid tenant alongside no other hint', () => {
    const params = new URLSearchParams(
      'default_booking_tenant_id=tenant_ks&plan=family&next=%2Fen%2Fmember'
    );

    expect(resolveLoginTenantHint(params)).toBeUndefined();
  });

  it.each(['tenant_evil', '', '  ', 'TENANT_KS'])('rejects the unsupported hint %o', value => {
    const params = new URLSearchParams();
    params.set('tenantId', value);

    expect(resolveLoginTenantHint(params)).toBeUndefined();
    expect(resolveLoginTenantHint(params, value)).toBeUndefined();
  });
});

describe('resolveSocialOnboardingTenantContext', () => {
  it('keeps a redirected booking context usable for social onboarding', () => {
    const params = new URLSearchParams('default_booking_tenant_id=tenant_mk');

    expect(resolveSocialOnboardingTenantContext(params)).toEqual({
      tenantId: 'tenant_mk',
      deferred: true,
    });
    // The same request carries no password identity context.
    expect(resolveLoginTenantHint(params)).toBeUndefined();
  });

  it('marks server-resolved page context as a resolved intent and keeps its precedence', () => {
    const params = new URLSearchParams('tenantId=tenant_mk&default_booking_tenant_id=tenant_al');

    expect(resolveSocialOnboardingTenantContext(params, 'tenant_ks')).toEqual({
      tenantId: 'tenant_ks',
      deferred: false,
    });
  });

  it('prefers an explicit tenantId request over booking context, still deferred', () => {
    const params = new URLSearchParams('tenantId=tenant_mk&default_booking_tenant_id=tenant_al');

    expect(resolveSocialOnboardingTenantContext(params)).toEqual({
      tenantId: 'tenant_mk',
      deferred: true,
    });
  });

  it.each(['tenant_evil', '', '  ', 'TENANT_KS', 'tenant_ks tenant_mk'])(
    'returns no onboarding context for the unsupported booking value %o',
    value => {
      const params = new URLSearchParams();
      params.set('default_booking_tenant_id', value);

      expect(resolveSocialOnboardingTenantContext(params)).toBeNull();
    }
  );

  it('returns no onboarding context when the request carries no tenant at all', () => {
    expect(resolveSocialOnboardingTenantContext(new URLSearchParams('plan=family'))).toBeNull();
  });

  it('falls back to a request hint when the page context value is unusable', () => {
    const params = new URLSearchParams('default_booking_tenant_id=tenant_mk');

    expect(resolveSocialOnboardingTenantContext(params, 'tenant_evil')).toEqual({
      tenantId: 'tenant_mk',
      deferred: true,
    });
  });
});
