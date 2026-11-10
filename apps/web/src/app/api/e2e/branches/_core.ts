import { lockBranchPolicy } from '@interdomestik/database/branch-policy-lock';
import {
  canActivateBranch,
  SINGLE_BRANCH_LIMIT,
} from '@interdomestik/domain-users/admin/branch-policy';
import { db } from '@interdomestik/database/db';
import { branches } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type E2EBranchAction = 'cleanup' | 'create' | 'update' | 'delete';

export interface E2EBranchParams {
  action: E2EBranchAction;
  name?: string;
  code?: string;
  isActive?: boolean;
  pattern?: string;
  tenantId?: string;
}

export async function handleE2EBranchOperation(params: E2EBranchParams) {
  const { action, name, code, isActive, pattern, tenantId } = params;

  if (action === 'cleanup') {
    if (!pattern) throw new Error('Missing pattern');
    await db.delete(branches).where(eq(branches.code, pattern));
    return { success: true };
  }

  if (action === 'create') {
    if (!name || !code || !tenantId) throw new Error('Missing fields');
    const id = nanoid();
    const slug = code.toLowerCase();

    // Keep the existing secret-authorized E2E connection; serialize its tenant's policy and write.
    return db.transaction(async tx => {
      await lockBranchPolicy(tx, tenantId);
      if ((isActive ?? true) && !(await canActivateBranch(tx, tenantId))) {
        return { success: false, ...SINGLE_BRANCH_LIMIT };
      }
      await tx.insert(branches).values({
        id,
        tenantId,
        name,
        code,
        slug,
        isActive: isActive ?? true,
      });
      return { success: true, id };
    });
  }

  if (action === 'update') {
    if (!code || !name) throw new Error('Missing fields');
    await db.update(branches).set({ name }).where(eq(branches.code, code));
    return { success: true };
  }

  if (action === 'delete') {
    if (!code) throw new Error('Missing code');
    await db.delete(branches).where(eq(branches.code, code));
    return { success: true };
  }

  throw new Error('Unknown action');
}
