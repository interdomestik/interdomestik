import { eq, user, userRoles, type TenantTransaction } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { canManageExistingRoles } from './role-rules';

export type RoleGrant = Readonly<{ role: string; branchId: string | null }>;

/** The locked user's primary role, branch membership and every role grant it holds. */
export type RoleMutationTarget = Readonly<{
  role: string;
  branchId: string | null;
  grants: readonly RoleGrant[];
}>;

export async function lockRoleMutationTarget(
  tx: TenantTransaction,
  tenantId: string,
  userId: string,
  actorRole: string
): Promise<RoleMutationTarget | null> {
  // Both assignment writers acquire this lock before reading roles or mutating them.
  const [target] = await tx
    .select({ role: user.role, branchId: user.branchId })
    .from(user)
    .where(withTenant(tenantId, user.tenantId, eq(user.id, userId)))
    .for('update');
  if (!target) return null;

  const grants = await tx.query.userRoles.findMany({
    where: withTenant(tenantId, userRoles.tenantId, eq(userRoles.userId, userId)),
    columns: { role: true, branchId: true },
  });
  if (
    actorRole !== 'super_admin' &&
    !canManageExistingRoles(actorRole, [target.role, ...grants.map(row => row.role)])
  ) {
    return null;
  }
  return {
    role: target.role,
    branchId: target.branchId ?? null,
    grants: grants.map(row => ({ role: row.role, branchId: row.branchId ?? null })),
  };
}
