import { describe, expect, it } from 'vitest';

import { tenantCacheKey, tenantCacheTag } from './tenant-cache';

describe('tenantCacheKey', () => {
  it('separates overlapping ids by access tenant', () => {
    const route = '/member/claims/shared-id';
    const sharedValues = ['claim_id', 'shared-id'];

    const tenantA = tenantCacheKey({
      accessTenantId: 'tenant-a',
      memberId: 'member-1',
      route,
      scope: 'member-claim',
      values: sharedValues,
    });
    const tenantB = tenantCacheKey({
      accessTenantId: 'tenant-b',
      memberId: 'member-1',
      route,
      scope: 'member-claim',
      values: sharedValues,
    });

    expect(tenantA).toContain('access_tenant_id');
    expect(tenantA).toContain('member_id');
    expect(tenantA.join('\0')).not.toEqual(tenantB.join('\0'));
  });

  it('rejects blank tenant or member key components', () => {
    expect(() =>
      tenantCacheKey({ accessTenantId: ' ', route: '/member', scope: 'claims' })
    ).toThrow('tenant cache key requires accessTenantId');
    expect(() =>
      tenantCacheKey({
        accessTenantId: 'tenant-a',
        memberId: '',
        route: '/member',
        scope: 'claims',
      })
    ).toThrow('tenant cache key requires memberId');
  });
});

describe('tenantCacheTag', () => {
  it('builds tenant-qualified case and member invalidation tags', () => {
    expect(tenantCacheTag('case', 'tenant-a', 'claim-1')).toBe(
      'case:access_tenant_id:tenant-a:claim-1'
    );
    expect(tenantCacheTag('member', 'tenant-a', 'member-1')).toBe(
      'member:access_tenant_id:tenant-a:member-1'
    );
  });
});
