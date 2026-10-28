import { dbAdmin } from '@interdomestik/database/db';
import { tenants } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
type SessionLike = { user?: { role?: string | null } | null } | null;
export async function readActiveClassificationTenant(session: SessionLike, tenantId: string) {
  if (session?.user?.role !== 'super_admin' || !tenantId) return null;
  return (
    (await dbAdmin.query.tenants.findFirst({
      where: and(eq(tenants.id, tenantId), eq(tenants.isActive, true)),
      columns: { id: true },
    })) ?? null
  );
}
export async function readActiveClassificationTenantOptions(
  session: SessionLike,
  currentTenantId: string | null
) {
  if (session?.user?.role !== 'super_admin' || !currentTenantId) return [];
  const rows = await dbAdmin.query.tenants.findMany({
    where: eq(tenants.isActive, true),
    columns: { id: true, name: true, countryCode: true },
    orderBy: (table, { asc }) => [asc(table.name)],
  });
  return rows.filter(row => row.id !== currentTenantId);
}
