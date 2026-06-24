import { cookies, headers } from 'next/headers';
import {
  resolveTenantContextFromSources,
  resolveDefaultPublicTenantId,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  type TenantId,
  type TenantResolutionResult,
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
 * 5) Public no-tenant context for ida/front-door hosts or neutral fallbacks
 *
 * This helper uses the production-sensitive resolver default. In production-like
 * environments, user-controlled cookie/header/query hints are ignored on neutral
 * hosts unless a caller explicitly opts out through `resolveTenantIdFromSources`.
 */
export async function resolveTenantIdFromRequest(
  options: ResolveTenantOptions = {}
): Promise<TenantId> {
  const context = await resolveTenantContextFromRequest(options);
  return context.kind === 'tenant' ? context.tenantId : resolveDefaultPublicTenantId();
}

export async function resolveTenantContextFromRequest(
  options: ResolveTenantOptions = {}
): Promise<TenantResolutionResult> {
  const h = await headers();
  const cookieStore = await cookies();

  return resolveTenantContextFromSources({
    host: getRequestHost(h),
    cookieTenantId: cookieStore.get(TENANT_COOKIE_NAME)?.value ?? null,
    headerTenantId: h.get(TENANT_HEADER_NAME),
    queryTenantId: options.tenantIdFromQuery ?? null,
  });
}
