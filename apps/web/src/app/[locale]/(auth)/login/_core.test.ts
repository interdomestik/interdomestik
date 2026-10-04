import { describe, expect, it } from 'vitest';

import { getLoginTenantBootstrapRedirect } from './_core';

describe('login core', () => {
  it('keeps a deliberate query tenant on the neutral entry instead of bootstrapping a cookie', () => {
    // A public front-door context has no cookie-backed tenant authority, so a bootstrap round trip
    // would drop the validated query (or repeat forever). The page carries the query tenant itself.
    const result = getLoginTenantBootstrapRedirect({
      locale: 'sq',
      tenantIdFromQuery: 'tenant_mk',
      planIdFromQuery: 'family',
      nextPathFromQuery: '/sq/member/claims/new?mode=drafts',
      tenantIdFromContext: null,
    });

    expect(result).toBeNull();
  });

  it('returns bootstrap redirect when a resolved context tenant differs from the query tenant', () => {
    const result = getLoginTenantBootstrapRedirect({
      locale: 'sq',
      tenantIdFromQuery: 'tenant_mk',
      tenantIdFromContext: 'tenant_ks',
    });

    expect(result).toBe('/sq/login/tenant-context?tenantId=tenant_mk&next=%2Fsq%2Flogin');
  });

  it('preserves valid plan continuity in tenant bootstrap redirect', () => {
    const result = getLoginTenantBootstrapRedirect({
      locale: 'sq',
      tenantIdFromQuery: 'tenant_mk',
      planIdFromQuery: 'family',
      tenantIdFromContext: 'tenant_ks',
    });

    expect(result).toBe(
      '/sq/login/tenant-context?tenantId=tenant_mk&next=%2Fsq%2Flogin%3Fplan%3Dfamily'
    );
  });

  it('preserves a validated role-scoped next alongside plan continuity', () => {
    const result = getLoginTenantBootstrapRedirect({
      locale: 'sq',
      tenantIdFromQuery: 'tenant_mk',
      planIdFromQuery: 'family',
      nextPathFromQuery: '/sq/member/claims/new?mode=drafts',
      tenantIdFromContext: 'tenant_ks',
    });

    expect(result).toBe(
      '/sq/login/tenant-context?tenantId=tenant_mk&next=%2Fsq%2Flogin%3Fplan%3Dfamily%26next%3D%252Fsq%252Fmember%252Fclaims%252Fnew%253Fmode%253Ddrafts'
    );
  });

  it.each([
    '//foreign.invalid/sq/member',
    'https://foreign.invalid/sq/member',
    '/sq/member\\..\\admin',
    'sq/member',
  ])('drops the unusable next continuation %o', nextPathFromQuery => {
    const result = getLoginTenantBootstrapRedirect({
      locale: 'sq',
      tenantIdFromQuery: 'tenant_mk',
      nextPathFromQuery,
      tenantIdFromContext: 'tenant_ks',
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

  it.each(['invalid', '', '  ', 'TENANT_MK'])(
    'returns null when the query tenant %o is unusable',
    tenantIdFromQuery => {
      const result = getLoginTenantBootstrapRedirect({
        locale: 'sq',
        tenantIdFromQuery,
        tenantIdFromContext: 'tenant_ks',
      });

      expect(result).toBeNull();
    }
  );

  it('returns null when neither a query tenant nor a context tenant exists', () => {
    expect(getLoginTenantBootstrapRedirect({ locale: 'sq', tenantIdFromContext: null })).toBeNull();
  });
});
