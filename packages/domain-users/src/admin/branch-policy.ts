import { and, branches, eq, tenantSettings, type TenantTransaction } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

export const SINGLE_BRANCH_LIMIT = {
  error: 'Only one active branch is allowed for this tenant.',
  code: 'single_branch_limit',
} as const;

/** Must run after lockBranchPolicy, inside the same withTenantAuthority transaction as the write. */
export async function canActivateBranch(
  tx: TenantTransaction,
  tenantId: string,
  branchId?: string
): Promise<boolean> {
  const setting = await tx.query.tenantSettings.findFirst({
    where: withTenant(
      tenantId,
      tenantSettings.tenantId,
      and(eq(tenantSettings.category, 'branches'), eq(tenantSettings.key, 'multi_branch'))
    ),
  });
  if (setting?.value?.enabled === true) return true;
  const active = await tx.query.branches.findMany({
    where: withTenant(tenantId, branches.tenantId, eq(branches.isActive, true)),
    columns: { id: true },
  });
  return active.every(branch => branch.id === branchId);
}
