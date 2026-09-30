import { eq, user, userRoles, type TenantTransaction } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { canManageExistingRoles } from './role-rules';

export async function lockRoleMutationTarget(
  tx: TenantTransaction,
  tenantId: string,
  userId: string,
  actorRole: string
): Promise<{ role: string } | null> {
  // Both assignment writers acquire this lock before reading roles or mutating them.
  const [target] = await tx
    .select({ role: user.role })
    .from(user)
    .where(withTenant(tenantId, user.tenantId, eq(user.id, userId)))
    .for('update');
  if (!target) return null;

  if (actorRole !== 'super_admin') {
    const assignments = await tx.query.userRoles.findMany({
      where: withTenant(tenantId, userRoles.tenantId, eq(userRoles.userId, userId)),
      columns: { role: true },
    });
    if (!canManageExistingRoles(actorRole, [target.role, ...assignments.map(row => row.role)])) {
      return null;
    }
  }
  return target;
}
