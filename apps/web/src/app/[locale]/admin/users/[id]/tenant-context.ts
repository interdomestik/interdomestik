import { delegateSuperAdminTenant } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

function getFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The tenant authority an admin profile read runs under: the session's own, or for a super_admin
 * naming a tenant, a delegation to that tenant. An unknown or inactive tenant falls back to the
 * session authority, as the tenant switch always has.
 */
export async function resolveAdminTenantAuthority(params: {
  authority: TenantAuthority | null;
  role: string | null;
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<TenantAuthority | null> {
  const { authority, role, searchParams } = params;
  if (!authority || role !== 'super_admin') {
    return authority;
  }

  const requestedTenantId = getFirst(searchParams.tenantId)?.trim();
  if (!requestedTenantId) {
    return authority;
  }

  return (await delegateSuperAdminTenant(authority, requestedTenantId)) ?? authority;
}
