import { db } from '@interdomestik/database/db';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

type SessionLike = {
  user?: {
    id?: string | null;
    role?: string | null;
    tenantId?: string | null;
  } | null;
} | null;

async function getExplicitTenantRolesFor(
  userId: string | null | undefined,
  tenantId: string | null | undefined
): Promise<string[]> {
  if (!userId || !tenantId) return [];
  const rows = await db.query.userRoles.findMany({
    where: (r, { and: andFn }) => andFn(eq(r.userId, userId), eq(r.tenantId, tenantId)),
    columns: { role: true },
  });
  return rows.map(row => row.role);
}

async function isActiveTenant(tenantId: string): Promise<boolean> {
  const tenant = await db.query.tenants.findFirst({
    where: (t, { and: andFn }) => andFn(eq(t.id, tenantId), eq(t.isActive, true)),
    columns: { id: true },
  });
  return Boolean(tenant?.id);
}

type PortalAccessOptions = {
  requestedTenantId?: string | null;
};

export async function hasEffectivePortalAccess(
  session: SessionLike,
  allowedRoles: readonly string[],
  options: PortalAccessOptions = {}
): Promise<boolean> {
  const sessionTenantId = session?.user?.tenantId ?? null;
  const requestedTenantId = options.requestedTenantId ?? sessionTenantId ?? null;
  const userId = session?.user?.id ?? null;
  const legacyRole = session?.user?.role ?? null;

  if (!requestedTenantId) {
    return Boolean(legacyRole && allowedRoles.includes(legacyRole));
  }

  const explicitRoles = await getExplicitTenantRolesFor(userId, requestedTenantId);
  if (explicitRoles.length > 0) {
    return explicitRoles.some(role => allowedRoles.includes(role));
  }

  if (sessionTenantId && requestedTenantId === sessionTenantId) {
    return Boolean(legacyRole && allowedRoles.includes(legacyRole));
  }

  if (legacyRole === 'super_admin' && allowedRoles.includes('super_admin')) {
    return isActiveTenant(requestedTenantId);
  }

  return false;
}

export async function requireEffectivePortalAccessOrNotFound(
  session: SessionLike,
  allowedRoles: readonly string[],
  options: PortalAccessOptions = {}
): Promise<void> {
  try {
    const allowed = await hasEffectivePortalAccess(session, allowedRoles, options);
    if (!allowed) notFound();
  } catch (error) {
    console.error('[PortalAccess] Authorization check failed:', error);
    notFound();
  }
}

export async function requireEffectivePortalAccessOrUnauthorized(
  session: SessionLike,
  allowedRoles: readonly string[],
  options: PortalAccessOptions = {}
): Promise<void> {
  const allowed = await hasEffectivePortalAccess(session, allowedRoles, options);
  if (!allowed) {
    throw new Error('Unauthorized');
  }
}
