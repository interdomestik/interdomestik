import { and, db, eq, userRoles } from '@interdomestik/database';
import { isNull } from 'drizzle-orm';

import type { UserSession } from '../types';

const DEFAULT_TENANT_ID = 'tenant_mk';

const TENANT_ADMIN_ROLES = ['tenant_admin', 'super_admin'] as const;
const GLOBAL_SUPER_ADMIN_ROLE = 'super_admin' as const;

async function hasTenantRole(params: {
  tenantId: string;
  userId: string;
  role: string;
  branchId?: string | null;
}): Promise<boolean> {
  const { tenantId, userId, role, branchId } = params;

  const rows = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.tenantId, tenantId),
        eq(userRoles.userId, userId),
        eq(userRoles.role, role),
        branchId == null ? isNull(userRoles.branchId) : eq(userRoles.branchId, branchId)
      )
    )
    .limit(1);

  return rows.length > 0;
}

export function requireAdminSession(session: UserSession | null): UserSession {
  if (!session?.user || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  return session;
}

/**
 * Tenant-scoped admin guard.
 *
 * Accepts legacy global `session.user.role === 'admin'` for backward compatibility,
 * or an explicit tenant-level RBAC role in `user_roles`.
 */
export async function requireTenantAdminSession(session: UserSession | null): Promise<UserSession> {
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  // Platform-wide super admin (best-practice: global scope).
  if (session.user.role === GLOBAL_SUPER_ADMIN_ROLE) {
    return session;
  }

  // Legacy global admin remains valid.
  if (session.user.role === 'admin') {
    return session;
  }

  const tenantId = session.user.tenantId ?? DEFAULT_TENANT_ID;
  const userId = session.user.id;

  for (const role of TENANT_ADMIN_ROLES) {
    if (
      await hasTenantRole({
        tenantId,
        userId,
        role,
      })
    ) {
      return session;
    }
  }

  throw new Error('Unauthorized');
}

export async function userHasRole(params: {
  session: UserSession | null;
  role: string;
  branchId?: string | null;
}): Promise<boolean> {
  const { session, role, branchId } = params;
  if (!session?.user) return false;

  // Global super admin implicitly has all roles.
  if (session.user.role === GLOBAL_SUPER_ADMIN_ROLE) return true;

  const tenantId = session.user.tenantId ?? DEFAULT_TENANT_ID;
  return hasTenantRole({ tenantId, userId: session.user.id, role, branchId });
}
