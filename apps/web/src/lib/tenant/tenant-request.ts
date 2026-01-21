import { cookies, headers } from 'next/headers';
import {
  coerceTenantId,
  resolveTenantFromHost,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  type TenantId,
} from './tenant-hosts';

export type ResolveTenantOptions = {
  tenantIdFromQuery?: string | null;
};

function getRequestHost(h: Headers): string {
  return h.get('x-forwarded-host') ?? h.get('host') ?? '';
}

/**
 * Tenant resolution contract (highest → lowest priority):
 * 1) Host-derived tenant (primary source of truth)
 * 2) Cookie `tenantId`
 * 3) Header `x-tenant-id`
 * 4) Query param `tenantId` (back-compat)
 */
export async function resolveTenantIdFromRequest(
  options: ResolveTenantOptions = {}
): Promise<TenantId | null> {
  const h = await headers();

  const hostTenant = resolveTenantFromHost(getRequestHost(h));
  if (hostTenant) return hostTenant;

  const cookieTenant = coerceTenantId((await cookies()).get(TENANT_COOKIE_NAME)?.value);
  if (cookieTenant) return cookieTenant;

  const headerTenant = coerceTenantId(h.get(TENANT_HEADER_NAME) ?? undefined);
  if (headerTenant) return headerTenant;

  const queryTenant = coerceTenantId(options.tenantIdFromQuery ?? undefined);
  if (queryTenant) return queryTenant;

  return null;
}
