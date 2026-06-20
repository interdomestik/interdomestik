import 'server-only';

export type TenantCacheKeyParams = {
  accessTenantId: string;
  memberId?: string;
  route: string;
  scope: string;
  values?: readonly string[];
};

function assertNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`tenant cache key requires ${field}`);
  return normalized;
}

export function tenantCacheKey(params: TenantCacheKeyParams): string[] {
  const key = [
    'scope',
    assertNonBlank(params.scope, 'scope'),
    'route',
    assertNonBlank(params.route, 'route'),
    'access_tenant_id',
    assertNonBlank(params.accessTenantId, 'accessTenantId'),
  ];

  if (params.memberId !== undefined) {
    key.push('member_id', assertNonBlank(params.memberId, 'memberId'));
  }

  for (const value of params.values ?? []) {
    key.push(assertNonBlank(value, 'values[]'));
  }

  return key;
}

export function tenantCacheTag(kind: 'case' | 'member', tenantId: string, id: string): string {
  return `${kind}:access_tenant_id:${assertNonBlank(tenantId, 'tenantId')}:${assertNonBlank(
    id,
    'id'
  )}`;
}
