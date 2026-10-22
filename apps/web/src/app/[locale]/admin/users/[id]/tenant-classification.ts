import { readActiveClassificationTenantOptions } from '@/server/auth/tenant-classification-metadata';

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

  return readActiveClassificationTenantOptions(params.session, params.currentTenantId);
}
