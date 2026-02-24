import * as Sentry from '@sentry/nextjs';
import { coerceTenantId } from '@/lib/tenant/tenant-hosts';

import type { TenantOption } from '@/components/auth/tenant-selector';

export async function loadTenantOptions(args: {
  resolvedTenantId?: string | null;
  loadTenants: () => Promise<TenantOption[]>;
}): Promise<TenantOption[]> {
  const { resolvedTenantId, loadTenants } = args;
  if (resolvedTenantId) return [];

  try {
    return await loadTenants();
  } catch (error) {
    console.error('Failed to load tenant options for login:', error);
    Sentry.captureException(error, {
      tags: { context: 'login_tenant_selector' },
    });
    return [];
  }
}

function coercePlanId(
  planId: string | null | undefined
): 'standard' | 'family' | 'business' | null {
  if (!planId) return null;
  const normalized = planId.trim().toLowerCase();
  if (normalized === 'standard' || normalized === 'family' || normalized === 'business') {
    return normalized;
  }
  return null;
}

export function getLoginTenantBootstrapRedirect(args: {
  locale: string;
  tenantIdFromQuery?: string | null;
  planIdFromQuery?: string | null;
  tenantIdFromContext?: string | null;
}): string | null {
  const { locale, tenantIdFromQuery, planIdFromQuery, tenantIdFromContext } = args;
  const queryTenantId = coerceTenantId(tenantIdFromQuery ?? undefined);
  const queryPlanId = coercePlanId(planIdFromQuery ?? null);
  if (!queryTenantId) return null;
  if (tenantIdFromContext === queryTenantId) return null;

  const nextPath = queryPlanId
    ? `/${locale}/login?plan=${encodeURIComponent(queryPlanId)}`
    : `/${locale}/login`;

  const params = new URLSearchParams({
    tenantId: queryTenantId,
    next: nextPath,
  });
  return `/${locale}/login/tenant-context?${params.toString()}`;
}
