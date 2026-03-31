import { cookies, headers } from 'next/headers';
import {
  resolveTenantContextFromSources,
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
 *
 * This helper intentionally uses the non-production-sensitive resolver mode.
 * Security-sensitive API entry points (auth/register/proxy) call
 * `resolveTenantIdFromSources(..., { productionSensitive: true })` directly.
 */
export async function resolveTenantIdFromRequest(
  options: ResolveTenantOptions = {}
): Promise<TenantId> {
  const context = await resolveTenantContextFromRequest(options);
  return context.tenantId;
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
