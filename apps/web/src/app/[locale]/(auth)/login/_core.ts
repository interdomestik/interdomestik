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

export function getLoginTenantBootstrapRedirect(args: {
  locale: string;
  tenantIdFromQuery?: string | null;
  tenantIdFromContext?: string | null;
}): string | null {
  const { locale, tenantIdFromQuery, tenantIdFromContext } = args;
  const queryTenantId = coerceTenantId(tenantIdFromQuery ?? undefined);
  if (!queryTenantId) return null;
  if (tenantIdFromContext === queryTenantId) return null;

  const params = new URLSearchParams({
    tenantId: queryTenantId,
    next: `/${locale}/login`,
  });
  return `/${locale}/login/tenant-context?${params.toString()}`;
}
