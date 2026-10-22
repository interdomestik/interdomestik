import { getActionContext } from '@/actions/admin-users/context';
import { dbAdmin, withTenantContext } from '@interdomestik/database';
import { branches, tenants } from '@interdomestik/database/schema';
import { ROLES, scopeFilter } from '@interdomestik/shared-auth';
import { eq, or } from 'drizzle-orm';

// Fixed metadata command: no caller-supplied session, query, callback, or database handle.
export async function readAuthorizedBranchDashboardMetadata(branchId: string) {
  const { session } = await getActionContext();
  if (!session?.user) throw new Error('Unauthorized');
  const role = session.user.role;
  if (role === 'user' || role === ROLES.agent) throw new Error('Forbidden');
  if (role === ROLES.branch_manager) {
    const assignedBranchId = session.user.branchId?.trim();
    if (!assignedBranchId || assignedBranchId !== branchId) return null;
  }
  const scope = scopeFilter(session);
  let tenantId = scope.tenantId;
  const branch = await (scope.isCrossTenantScope && role === ROLES.super_admin
    ? dbAdmin.query.branches.findFirst({
        where: or(eq(branches.id, branchId), eq(branches.code, branchId)),
        columns: { id: true, name: true, code: true, isActive: true, tenantId: true },
      })
    : withTenantContext({ tenantId }, tx =>
        tx.query.branches.findFirst({
          where: or(eq(branches.id, branchId), eq(branches.code, branchId)),
          columns: { id: true, name: true, code: true, isActive: true, tenantId: true },
        })
      ));
  if (!branch) return null;
  if (scope.isCrossTenantScope) tenantId = branch.tenantId;
  else if (branch.tenantId !== tenantId) throw new Error('Forbidden: Tenant Mismatch');
  // Currency is deny-all directory metadata; read only after branch authorization.
  const metadata = await dbAdmin.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { currency: true },
  });
  return metadata ? { ...branch, currency: metadata.currency } : null;
}
