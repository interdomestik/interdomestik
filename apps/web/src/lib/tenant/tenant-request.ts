import { cookies, headers } from 'next/headers';
import {
  resolveTenantIdFromSources,
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
  const cookieStore = await cookies();

  return resolveTenantIdFromSources({
    host: getRequestHost(h),
    cookieTenantId: cookieStore.get(TENANT_COOKIE_NAME)?.value ?? null,
    headerTenantId: h.get(TENANT_HEADER_NAME),
    queryTenantId: options.tenantIdFromQuery ?? null,
  });
}
