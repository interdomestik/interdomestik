import { user } from '@interdomestik/database/schema';
import { scopeFilter } from '@interdomestik/shared-auth';
import { and, eq, type SQL } from 'drizzle-orm';

import { isAllowedInAdmin } from '@/lib/rbac-portals';

/** Session-derived actor facts every admin member read must supply explicitly. */
export type MemberReadActor = Readonly<{
  role: string | null;
  branchId: string | null;
}>;

export type GrantedMemberReadScope = Readonly<{
  ok: true;
  role: string;
  tenantId: string;
  branchId: string | null;
}>;

export type MemberReadScope = GrantedMemberReadScope | Readonly<{ ok: false }>;

const DENIED: MemberReadScope = Object.freeze({ ok: false });

/**
 * Resolves which members an admin-portal actor may read inside the caller-owned tenant.
 * Admission follows the admin portal role contract; tenant versus branch breadth follows the
 * shared scopeFilter. A branch-scoped actor without a branch is denied, never widened.
 */
export function resolveMemberReadScope(params: {
  tenantId: string;
  actor: MemberReadActor;
}): MemberReadScope {
  const tenantId = params.tenantId.trim();
  const { role, branchId } = params.actor;
  if (!tenantId || !role || !isAllowedInAdmin(role)) {
    return DENIED;
  }

  const scope = scopeFilter({ user: { role, branchId, accessTenantId: tenantId } });
  if (scope.isFullTenantScope) {
    return { ok: true, role, tenantId, branchId: null };
  }
  if (scope.branchId) {
    return { ok: true, role, tenantId, branchId: scope.branchId };
  }
  return DENIED;
}

/** Combines a target member predicate with the granted tenant and, when scoped, branch. */
export function memberReadWhere(scope: GrantedMemberReadScope, target: SQL): SQL {
  const conditions: SQL[] = [target, eq(user.tenantId, scope.tenantId)];
  if (scope.branchId) {
    conditions.push(eq(user.branchId, scope.branchId));
  }
  return and(...conditions) as SQL;
}
