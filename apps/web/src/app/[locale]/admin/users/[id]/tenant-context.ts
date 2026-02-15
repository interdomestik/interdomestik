import { db } from '@interdomestik/database/db';
import { tenants } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

type SessionLike = {
  user?: {
    role?: string | null;
    tenantId?: string | null;
  } | null;
} | null;

function getFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function resolveAdminTenantContext(params: {
  session: SessionLike;
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<string | null> {
  const { session, searchParams } = params;
  const sessionTenantId = session?.user?.tenantId ?? null;
  const role = session?.user?.role ?? null;

  if (role !== 'super_admin') {
    return sessionTenantId;
  }

  const requestedTenantId = getFirst(searchParams.tenantId);
  if (!requestedTenantId) {
    return sessionTenantId;
  }

  const requestedTenant = await db.query.tenants.findFirst({
    where: and(eq(tenants.id, requestedTenantId), eq(tenants.isActive, true)),
    columns: { id: true },
  });

  return requestedTenant?.id ?? sessionTenantId;
}
