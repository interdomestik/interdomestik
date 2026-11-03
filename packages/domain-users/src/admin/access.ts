import { and, eq, userRoles } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { isNull } from 'drizzle-orm';

import { ensureTenantId } from '@interdomestik/shared-auth';
import type { UserSession } from '../types';

const GLOBAL_SUPER_ADMIN_ROLE = 'super_admin' as const;

/**
 * Tenant RBAC grant lookup for the session user, read under that user's own session authority. The
 * authority must name the same tenant and user as the session, or the lookup fails closed.
 */
async function hasTenantRole(params: {
  authority: TenantAuthority | null | undefined;
  tenantId: string;
  userId: string;
  role: string;
  branchId?: string | null;
}): Promise<boolean> {
  const { authority, tenantId, userId, role, branchId } = params;
  if (!authority) return false;
  const descriptor = readTenantAuthority(authority);
  if (descriptor.tenantId !== tenantId || descriptor.principal?.userId !== userId) return false;

  const rows = await withTenantAuthority(authority, tx =>
    tx
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
      .limit(1)
  );

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
 * or an explicit tenant-level RBAC role in `user_roles`. The RBAC grant lookup needs the session's
 * own tenant authority; without it only the primary role decides.
 */
export async function requireTenantAdminSession(
  session: UserSession | null,
  authority?: TenantAuthority | null
): Promise<UserSession> {
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

  for (const role of ['tenant_admin', GLOBAL_SUPER_ADMIN_ROLE]) {
    if (await hasTenantRole({ authority, tenantId, userId, role })) {
      return session;
    }
  }

  throw new Error('Unauthorized');
}

/**
 * Allows tenant admins OR branch managers.
 *
 * Branch managers must be branch-scoped (branchId present).
 */
export async function requireTenantAdminOrBranchManagerSession(
  session: UserSession | null,
  authority?: TenantAuthority | null
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
    return requireTenantAdminSession(session, authority);
  }

  // If branch_manager is granted via tenant RBAC roles, allow only with branch scope.
  if (
    session.user.branchId &&
    (await userHasRole({
      session,
      authority,
      role: 'branch_manager',
      branchId: session.user.branchId,
    }))
  ) {
    return session;
  }

  // Otherwise fall back to tenant admin.
  return requireTenantAdminSession(session, authority);
}

export async function userHasRole(params: {
  session: UserSession | null;
  authority?: TenantAuthority | null;
  role: string;
  branchId?: string | null;
}): Promise<boolean> {
  const { session, authority, role, branchId } = params;
  if (!session?.user) return false;

  const tenantId = ensureTenantId(session);
  return hasTenantRole({ authority, tenantId, userId: session.user.id, role, branchId });
}
