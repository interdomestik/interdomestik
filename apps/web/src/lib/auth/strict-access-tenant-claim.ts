import { coerceTenantId, type TenantId } from '@/lib/tenant/tenant-hosts';

/** A malformed explicit access claim denies access; only absent claims use tenantId. */
export function strictAccessTenantClaim(user: {
  accessTenantId?: unknown;
  tenantId?: unknown;
}): TenantId | null {
  const claim = user.accessTenantId ?? user.tenantId;
  return typeof claim === 'string' ? coerceTenantId(claim) : null;
}
