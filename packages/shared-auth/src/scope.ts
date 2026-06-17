/**
 * Query Scope Filters
 * Phase 2: Returns tenant + branch + agent filters based on session
 */

import { MissingTenantError, UnauthorizedError } from './errors';
import { isSuperAdmin, isTenantAdmin, ROLES, type Permission } from './permissions';
import { ensureAccessTenantId, type SessionWithTenant } from './session';

export type ScopeFilter = {
  tenantId: string;
  accessTenantId: string;
  branchId?: string | null;
  agentId?: string | null;
  userId?: string | null;
  isFullTenantScope: boolean;
  isCrossTenantScope: boolean;
};

/**
 * Build scope filter based on user's role and assignment
 *
 * - super_admin: cross-tenant (all data)
 * - tenant_admin: full tenant scope
 * - staff: full tenant scope (claims only)
 * - branch_manager: branch-scoped
 * - agent: agent-scoped (only their assigned members/claims)
 * - member: self only
 */
export function scopeFilter(session: SessionWithTenant): ScopeFilter {
  if (!session?.user) {
    throw new UnauthorizedError();
  }

  const { id: userId, role, branchId } = session.user;
  const accessTenantId =
    session.user.accessTenantId?.trim() || session.user.tenantId?.trim() || null;

  // Super admin: cross-tenant access
  if (isSuperAdmin(role)) {
    return {
      tenantId: accessTenantId ?? '*',
      accessTenantId: accessTenantId ?? '*',
      isFullTenantScope: true,
      isCrossTenantScope: true,
    };
  }

  if (!accessTenantId) {
    throw new MissingTenantError();
  }
  const tenantId = ensureAccessTenantId(session);

  // Tenant admin: full tenant scope
  if (isTenantAdmin(role)) {
    return {
      tenantId,
      accessTenantId: tenantId,
      isFullTenantScope: true,
      isCrossTenantScope: false,
    };
  }

  // Read-only global support and auditor roles inspect an explicitly selected tenant.
  if (role === ROLES.global_support || role === ROLES.auditor) {
    return {
      tenantId,
      accessTenantId: tenantId,
      isFullTenantScope: true,
      isCrossTenantScope: false,
    };
  }

  // Staff: full tenant scope for claims
  if (role === ROLES.staff) {
    return {
      tenantId,
      accessTenantId: tenantId,
      isFullTenantScope: true,
      isCrossTenantScope: false,
    };
  }

  // Branch manager: branch-scoped
  if (role === ROLES.branch_manager) {
    return {
      tenantId,
      accessTenantId: tenantId,
      branchId: branchId ?? null,
      isFullTenantScope: false,
      isCrossTenantScope: false,
    };
  }

  // Agent: agent-scoped (only their assigned members/claims)
  if (role === ROLES.agent) {
    return {
      tenantId,
      accessTenantId: tenantId,
      agentId: userId ?? null,
      isFullTenantScope: false,
      isCrossTenantScope: false,
    };
  }

  // Member: self only
  return {
    tenantId,
    accessTenantId: tenantId,
    userId: userId ?? null,
    isFullTenantScope: false,
    isCrossTenantScope: false,
  };
}

/**
 * Require a specific permission, throws if denied
 */

export function requirePermission(
  session: SessionWithTenant,
  permission: Permission,
  hasPermissionFn: (role: string | null | undefined, perm: Permission) => boolean
): void {
  if (!session?.user) {
    throw new UnauthorizedError();
  }

  if (!hasPermissionFn(session.user.role, permission)) {
    throw new UnauthorizedError(`Permission denied: ${permission}`);
  }
}
