import { listActiveTenantDirectory } from '@interdomestik/database/platform-directory';

import type { AdminTenantOption } from '@/components/admin/admin-tenant-selector';

type SessionLike = {
  user?: {
    role?: string | null;
  } | null;
} | null;

export async function getTenantClassificationOptions(params: {
  session: SessionLike;
  currentTenantId: string | null;
}): Promise<AdminTenantOption[]> {
  if (params.session?.user?.role !== 'super_admin' || !params.currentTenantId) {
    return [];
  }

  const activeTenants = await listActiveTenantDirectory({
    excludeTenantId: params.currentTenantId,
  });
  return activeTenants.map(tenant => ({
    id: tenant.id,
    name: tenant.name,
    countryCode: tenant.countryCode,
  }));
}
