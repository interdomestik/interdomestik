/**
 * Query Scope Filters
 * Phase 2: Returns tenant + branch + agent filters based on session
 */

import { MissingTenantError, UnauthorizedError } from './errors';
import { isSuperAdmin, isTenantAdmin, ROLES, type Permission } from './permissions';
import type { SessionWithTenant } from './session';

export type ScopeFilter = {
  tenantId: string;
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

  const { id: userId, role, tenantId, branchId } = session.user;

  // Super admin: cross-tenant access
  if (isSuperAdmin(role)) {
    return {
      tenantId: tenantId ?? '*',
      isFullTenantScope: true,
      isCrossTenantScope: true,
    };
  }

  if (!tenantId) {
    throw new MissingTenantError();
  }

  // Tenant admin: full tenant scope
  if (isTenantAdmin(role)) {
    return {
      tenantId,
      isFullTenantScope: true,
      isCrossTenantScope: false,
    };
  }

  // Read-only global support and auditor roles inspect an explicitly selected tenant.
  if (role === ROLES.global_support || role === ROLES.auditor) {
    return {
      tenantId,
      isFullTenantScope: true,
      isCrossTenantScope: false,
    };
  }

  // Staff: full tenant scope for claims
  if (role === ROLES.staff) {
    return {
      tenantId,
      isFullTenantScope: true,
      isCrossTenantScope: false,
    };
  }

  // Branch manager: branch-scoped
  if (role === ROLES.branch_manager) {
    return {
      tenantId,
      branchId: branchId ?? null,
      isFullTenantScope: false,
      isCrossTenantScope: false,
    };
  }

  // Agent: agent-scoped (only their assigned members/claims)
  if (role === ROLES.agent) {
    return {
      tenantId,
      agentId: userId ?? null,
      isFullTenantScope: false,
      isCrossTenantScope: false,
    };
  }

  // Member: self only
  return {
    tenantId,
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
