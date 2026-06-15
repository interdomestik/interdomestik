import { and, db, eq, userRoles } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { isNull } from 'drizzle-orm';

import { ensureTenantId } from '@interdomestik/shared-auth';
import type { UserSession } from '../types';

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
      withTenant(
        tenantId,
        userRoles.tenantId,
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.role, role),
          branchId === null || branchId === undefined
            ? isNull(userRoles.branchId)
            : eq(userRoles.branchId, branchId)
        )
      )
    )
    .limit(1);

  return rows.length > 0;
}

export function requireAdminSession(session: UserSession | null): UserSession {
  if (session?.user?.role !== 'admin') {
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

  // Technical super admins retain admin-portal operations, but do not inherit tenant RBAC grants.
  if (session.user.role === GLOBAL_SUPER_ADMIN_ROLE) {
    return session;
  }

  // Tenant admin via user.role field (primary authz path for tenant_admin role).
  if (session.user.role === 'tenant_admin') {
    ensureTenantId(session);
    return session;
  }

  // Legacy global admin remains valid.
  if (session.user.role === 'admin') {
    ensureTenantId(session);
    return session;
  }

  const tenantId = ensureTenantId(session);
  const userId = session.user.id;

  if (
    await hasTenantRole({
      tenantId,
      userId,
      role: 'tenant_admin',
    })
  ) {
    return session;
  }

  throw new Error('Unauthorized');
}

/**
 * Allows tenant admins OR branch managers.
 *
 * Branch managers must be branch-scoped (branchId present).
 */
export async function requireTenantAdminOrBranchManagerSession(
  session: UserSession | null
): Promise<UserSession> {
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  // If the primary role is explicitly branch_manager, allow.
  if (session.user.role === 'branch_manager') {
    if (!session.user.branchId) {
      throw new Error('Unauthorized');
    }
    ensureTenantId(session);
    return session;
  }

  if (
    session.user.role === GLOBAL_SUPER_ADMIN_ROLE ||
    session.user.role === 'tenant_admin' ||
    session.user.role === 'admin'
  ) {
    return requireTenantAdminSession(session);
  }

  // If branch_manager is granted via tenant RBAC roles, allow.
  if (
    await userHasRole({
      session,
      role: 'branch_manager',
      branchId: session.user.branchId ?? null,
    })
  ) {
    if (!session.user.branchId) {
      throw new Error('Unauthorized');
    }
    return session;
  }

  // Otherwise fall back to tenant admin.
  return requireTenantAdminSession(session);
}

export async function userHasRole(params: {
  session: UserSession | null;
  role: string;
  branchId?: string | null;
}): Promise<boolean> {
  const { session, role, branchId } = params;
  if (!session?.user) return false;

  const tenantId = ensureTenantId(session);
  return hasTenantRole({ tenantId, userId: session.user.id, role, branchId });
}
