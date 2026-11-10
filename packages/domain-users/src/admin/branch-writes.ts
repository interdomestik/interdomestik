import { branches, eq, type TenantTransaction } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { lockBranchPolicy } from '@interdomestik/database/branch-policy-lock';
import { canActivateBranch, SINGLE_BRANCH_LIMIT } from './branch-policy';

type BranchWrite = { name: string; slug: string; code: string | null };

async function findBranchConflict(
  tx: TenantTransaction,
  tenantId: string,
  input: BranchWrite,
  branchId?: string
) {
  // Direct column reads keep the tenant guard's withTenantAuthority read analysis intact.
  const slugMatch = await tx.query.branches.findFirst({
    where: withTenant(tenantId, branches.tenantId, eq(branches.slug, input.slug)),
    columns: { id: true },
  });
  if (slugMatch && slugMatch.id !== branchId) {
    return { error: 'Branch with this name (slug) already exists' };
  }
  if (!input.code) return null;
  const codeMatch = await tx.query.branches.findFirst({
    where: withTenant(tenantId, branches.tenantId, eq(branches.code, input.code)),
    columns: { id: true },
  });
  if (codeMatch && codeMatch.id !== branchId) {
    return { error: 'Branch with this code already exists' };
  }
  return null;
}

/** The exported core supplies its established withTenantAuthority transaction. */
export async function createBranchInTransaction(
  tx: TenantTransaction,
  tenantId: string,
  branchId: string,
  input: BranchWrite
) {
  await lockBranchPolicy(tx, tenantId);
  const conflict = await findBranchConflict(tx, tenantId, input);
  if (conflict) return conflict;
  if (!(await canActivateBranch(tx, tenantId))) return SINGLE_BRANCH_LIMIT;
  await tx.insert(branches).values({
    id: branchId,
    tenantId,
    ...input,
    code: input.code?.trim() || null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { success: true as const, data: { branchId } };
}

export async function updateBranchInTransaction(
  tx: TenantTransaction,
  tenantId: string,
  branchId: string,
  input: BranchWrite & { isActive?: boolean }
) {
  await lockBranchPolicy(tx, tenantId);
  const conflict = await findBranchConflict(tx, tenantId, input, branchId);
  if (conflict) return conflict;
  const isActive = input.isActive ?? true;
  if (isActive && !(await canActivateBranch(tx, tenantId, branchId))) return SINGLE_BRANCH_LIMIT;
  await tx
    .update(branches)
    .set({ ...input, code: input.code?.trim() || null, isActive, updatedAt: new Date() })
    .where(withTenant(tenantId, branches.tenantId, eq(branches.id, branchId)));
  return { success: true as const };
}
