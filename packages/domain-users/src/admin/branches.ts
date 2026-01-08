import { branches, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { hasPermission, PERMISSIONS, requirePermission } from '@interdomestik/shared-auth';
import { randomUUID } from 'node:crypto'; // NOSONAR
import type { ActionResult, UserDomainDeps, UserSession } from '../types';
import { resolveTenantId } from './utils';

export async function listBranchesCore(params: {
  session: UserSession | null;
  tenantId?: string;
  includeInactive?: boolean;
}) {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['branches.manage'], hasPermission);
  const tenantId = resolveTenantId(session, params.tenantId);

  const baseConditions = params.includeInactive ? undefined : eq(branches.isActive, true);

  return db.query.branches.findMany({
    where: withTenant(tenantId, branches.tenantId, baseConditions),
    orderBy: (b, { asc }) => [asc(b.name)],
  });
}

export async function createBranchCore(
  params: {
    session: UserSession | null;
    tenantId?: string;
    name: string;
    code?: string | null;
  },
  deps: UserDomainDeps = {}
) {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['branches.manage'], hasPermission);
  const tenantId = resolveTenantId(session, params.tenantId);

  const name = params.name.trim();
  if (!name) {
    return { error: 'Branch name is required' } satisfies ActionResult;
  }

  const slug = name
    .toLowerCase()
    .trim()
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/[\s_-]+/g, '-')
    .replaceAll(/(^-+)|(-+$)/g, '');

  if (!slug) {
    return { error: 'Invalid name generates empty slug' } satisfies ActionResult;
  }

  // Uniqueness Check
  const existing = await db.query.branches.findFirst({
    where: withTenant(tenantId, branches.tenantId, eq(branches.slug, slug)),
  });
  if (existing) {
    return { error: 'Branch with this name (slug) already exists' } satisfies ActionResult;
  }

  if (params.code) {
    const existingCode = await db.query.branches.findFirst({
      where: withTenant(tenantId, branches.tenantId, eq(branches.code, params.code)),
    });
    if (existingCode) {
      return { error: 'Branch with this code already exists' } satisfies ActionResult;
    }
  }

  const branchId = randomUUID();
  const code = params.code?.trim() || null;

  await db.insert(branches).values({
    id: branchId,
    tenantId,
    name,
    code,
    slug,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session!.user.id,
      actorRole: session!.user.role,
      action: 'branch.created',
      entityType: 'branch',
      entityId: branchId,
      tenantId,
      metadata: { name, code, slug },
    });
  }

  return { success: true, data: { branchId } } satisfies ActionResult<{ branchId: string }>;
}

export async function updateBranchCore(
  params: {
    session: UserSession | null;
    tenantId?: string;
    branchId: string;
    name: string;
    code?: string | null;
    isActive?: boolean;
  },
  deps: UserDomainDeps = {}
) {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['branches.manage'], hasPermission);
  const tenantId = resolveTenantId(session, params.tenantId);

  const name = params.name.trim();
  if (!name) {
    return { error: 'Branch name is required' } satisfies ActionResult;
  }

  const slug = name
    .toLowerCase()
    .trim()
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/[\s_-]+/g, '-')
    .replaceAll(/(^-+)|(-+$)/g, '');

  const existing = await db.query.branches.findFirst({
    where: withTenant(tenantId, branches.tenantId, eq(branches.slug, slug)),
  });
  if (existing && existing.id !== params.branchId) {
    return { error: 'Branch with this name (slug) already exists' } satisfies ActionResult;
  }

  if (params.code) {
    const existingCode = await db.query.branches.findFirst({
      where: withTenant(tenantId, branches.tenantId, eq(branches.code, params.code)),
    });
    if (existingCode && existingCode.id !== params.branchId) {
      return { error: 'Branch with this code already exists' } satisfies ActionResult;
    }
  }

  await db
    .update(branches)
    .set({
      name,
      slug,
      code: params.code?.trim() || null,
      isActive: params.isActive ?? true,
      updatedAt: new Date(),
    })
    .where(withTenant(tenantId, branches.tenantId, eq(branches.id, params.branchId)));

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session!.user.id,
      actorRole: session!.user.role,
      action: 'branch.updated',
      entityType: 'branch',
      entityId: params.branchId,
      tenantId,
      metadata: { name, code: params.code, isActive: params.isActive },
    });
  }

  return { success: true } satisfies ActionResult;
}

export async function deleteBranchCore(
  params: {
    session: UserSession | null;
    tenantId?: string;
    branchId: string;
  },
  deps: UserDomainDeps = {}
) {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['branches.manage'], hasPermission);
  const tenantId = resolveTenantId(session!, params.tenantId);

  await db
    .update(branches)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(withTenant(tenantId, branches.tenantId, eq(branches.id, params.branchId)));

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session!.user.id,
      actorRole: session!.user.role,
      action: 'branch.deleted', // or branch.deactivated since it's soft delete
      entityType: 'branch',
      entityId: params.branchId,
      tenantId,
    });
  }

  return { success: true } satisfies ActionResult;
}
