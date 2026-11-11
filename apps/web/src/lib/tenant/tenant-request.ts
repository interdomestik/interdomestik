import { readActiveTenantId } from '@interdomestik/database';
import {
  classifyAnonymousLead,
  AnonymousLeadClassificationError,
  type PublicOnboardingTenant,
} from './anonymous-lead-classification';
import { cookies, headers } from 'next/headers';
import {
  resolveTenantContextFromSources,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  type TenantResolutionResult,
} from './tenant-hosts';

export type ResolveTenantOptions = {
  tenantIdFromQuery?: string | null;
};

function getRequestHost(h: Headers): string {
  return h.get('x-forwarded-host') ?? h.get('host') ?? '';
}

/** Anonymous ownership is explicit; request context below is inspection only. */
export async function resolveTenantIdFromRequest(
  classification: unknown = {}
): Promise<PublicOnboardingTenant> {
  const tenantId = classifyAnonymousLead(classification);
  if ((await readActiveTenantId(tenantId)) !== tenantId) {
    throw new AnonymousLeadClassificationError('unavailable');
  }
  return tenantId;
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
