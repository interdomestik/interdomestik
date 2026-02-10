import * as Sentry from '@sentry/nextjs';

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
