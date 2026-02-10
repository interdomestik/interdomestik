import { and, db, eq, userRoles } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { isNull, or } from 'drizzle-orm';

import { ensureTenantId } from '@interdomestik/shared-auth';
import type { UserSession } from '../types';

const TENANT_ADMIN_ROLES = ['tenant_admin', 'super_admin'] as const;
const GLOBAL_SUPER_ADMIN_ROLE = 'super_admin' as const;
const BASE_MEMBER_ROLE = 'member' as const;

async function hasTenantRole(params: {
  tenantId: string;
  userId: string;
  role: string;
  branchId?: string | null;
}): Promise<boolean> {
  const { tenantId, userId, role, branchId } = params;
  const branchScopeFilter =
    branchId === undefined
      ? undefined
      : branchId === null
        ? isNull(userRoles.branchId)
        : or(isNull(userRoles.branchId), eq(userRoles.branchId, branchId));

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
          ...(branchScopeFilter ? [branchScopeFilter] : [])
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

  // Platform-wide super admin (best-practice: global scope).
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
    return session;
  }

  // If branch_manager is granted via tenant RBAC roles, allow.
  if (
    await userHasRole({
      session,
      role: 'branch_manager',
    })
  ) {
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

  // Global super admin implicitly has all roles.
  if (session.user.role === GLOBAL_SUPER_ADMIN_ROLE) return true;

  const tenantId = ensureTenantId(session);
  return hasTenantRole({ tenantId, userId: session.user.id, role, branchId });
}

/**
 * Transitional role resolver:
 * - Honors legacy session.user.role checks.
 * - Falls back to tenant-scoped user_roles for canonical RBAC.
 */
export async function hasEffectiveRole(params: {
  session: UserSession | null;
  role: string;
  branchId?: string | null;
}): Promise<boolean> {
  const { session, role, branchId } = params;
  if (!session?.user) return false;
  if (session.user.role === GLOBAL_SUPER_ADMIN_ROLE) return true;

  // Base identity: every authenticated end-user has member access.
  if (role === BASE_MEMBER_ROLE) return true;

  const tenantId = ensureTenantId(session);
  const resolvedRoles = await db
    .select({ role: userRoles.role, branchId: userRoles.branchId })
    .from(userRoles)
    .where(withTenant(tenantId, userRoles.tenantId, eq(userRoles.userId, session.user.id)))
    .limit(200);

  // Canonical precedence: if user_roles exist, they are authoritative.
  if (resolvedRoles.length > 0) {
    if (branchId === undefined) {
      return resolvedRoles.some(row => row.role === role);
    }

    if (branchId === null) {
      return resolvedRoles.some(row => row.role === role && row.branchId === null);
    }

    return resolvedRoles.some(
      row => row.role === role && (row.branchId === null || row.branchId === branchId)
    );
  }

  // Transitional fallback for legacy rows not yet backfilled.
  return session.user.role === role;
}
