import { db } from '@interdomestik/database/db';
import { tenants } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

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

  const activeTenants = await db.query.tenants.findMany({
    where: eq(tenants.isActive, true),
    columns: {
      id: true,
      name: true,
      countryCode: true,
    },
    orderBy: (table, { asc: ascFn }) => [ascFn(table.name)],
  });

  return activeTenants
    .filter(tenant => tenant.id !== params.currentTenantId)
    .map(tenant => ({
      id: tenant.id,
      name: tenant.name,
      countryCode: tenant.countryCode,
    }));
}
