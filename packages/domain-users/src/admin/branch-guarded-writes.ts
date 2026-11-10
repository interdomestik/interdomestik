import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { hasPermission, PERMISSIONS, requirePermission } from '@interdomestik/shared-auth';
import { randomUUID } from 'node:crypto';
import type { ActionResult, UserDomainDeps } from '../types';
import { branchSlugFromName } from './branch-slug';
import { createBranchInTransaction, updateBranchInTransaction } from './branch-writes';
import type { createBranchCore, updateBranchCore } from './branches';
import { resolveTenantAuthority } from './utils';

type CreateParams = Parameters<typeof createBranchCore>[0];
type UpdateParams = Parameters<typeof updateBranchCore>[0];
type PreparedWrite = {
  authority: TenantAuthority;
  tenantId: string;
  name: string;
  slug: string;
  session: NonNullable<CreateParams['session']>;
  code: string | null;
};

async function prepareBranchWrite(
  params: CreateParams,
  mode: 'create' | 'update'
): Promise<PreparedWrite | { error: string }> {
  if (!params.session) throw new Error('Unauthorized');
  requirePermission(params.session, PERMISSIONS['branches.manage'], hasPermission);
  const authority = await resolveTenantAuthority(params.session, params.authority);
  const { tenantId } = readTenantAuthority(authority);
  const name = params.name.trim();
  const slug = branchSlugFromName(name);
  if (!name) return { error: 'Branch name is required' };
  if (mode === 'create' && !slug) return { error: 'Invalid name generates empty slug' };
  return { authority, tenantId, name, slug, session: params.session, code: params.code ?? null };
}

async function auditBranchWrite(
  context: PreparedWrite,
  branchId: string,
  metadata: Record<string, unknown>,
  action: 'branch.created' | 'branch.updated',
  deps: UserDomainDeps
): Promise<void> {
  await deps.logAuditEvent?.({
    actorId: context.session.user.id,
    actorRole: context.session.user.role,
    authority: context.authority,
    entityType: 'branch',
    entityId: branchId,
    action,
    metadata,
  });
}

/** The lock, uniqueness/policy checks and insert share one tenant transaction. */
export async function createGuardedBranchCore(
  params: CreateParams,
  deps: UserDomainDeps = {}
): Promise<ActionResult<{ branchId: string }>> {
  const context = await prepareBranchWrite(params, 'create');
  if ('error' in context) return { error: context.error };
  const branchId = randomUUID();
  const { authority, tenantId, name, slug, code } = context;
  const result = await withTenantAuthority(authority, tx =>
    createBranchInTransaction(tx, tenantId, branchId, { name, slug, code })
  );
  if ('error' in result) return result;
  await auditBranchWrite(
    context,
    branchId,
    { name, code: code?.trim() || null, slug },
    'branch.created',
    deps
  );
  return result;
}

/** Includes implicit reactivation through the legacy isActive default. */
export async function updateGuardedBranchCore(
  params: UpdateParams,
  deps: UserDomainDeps = {}
): Promise<ActionResult> {
  const context = await prepareBranchWrite(params, 'update');
  if ('error' in context) return { error: context.error };
  const { authority, tenantId, name, slug, code } = context;
  const result = await withTenantAuthority(authority, tx =>
    updateBranchInTransaction(tx, tenantId, params.branchId, {
      name,
      slug,
      code,
      isActive: params.isActive,
    })
  );
  if ('error' in result) return result;
  await auditBranchWrite(
    context,
    params.branchId,
    {
      name,
      code: params.code,
      isActive: params.isActive,
    },
    'branch.updated',
    deps
  );
  return result;
}
