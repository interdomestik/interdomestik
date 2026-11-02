import { branches, eq } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { hasPermission, PERMISSIONS, requirePermission } from '@interdomestik/shared-auth';
import { randomUUID } from 'node:crypto'; // NOSONAR
import type { ActionResult, UserDomainDeps, UserSession } from '../types';
import { branchSlugFromName } from './branch-slug';
import { resolveTenantAuthority } from './utils';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function listBranchesCore(params: {
  session: UserSession | null;
  authority: TenantAuthority | null;
  includeInactive?: boolean;
}) {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['branches.manage'], hasPermission);
  const authority = await resolveTenantAuthority(session, params.authority);
  const { tenantId } = readTenantAuthority(authority);

  const baseConditions = params.includeInactive ? undefined : eq(branches.isActive, true);

  return withTenantAuthority(
    authority,
    async tx =>
      await tx.query.branches.findMany({
        where: withTenant(tenantId, branches.tenantId, baseConditions),
        orderBy: (b, { asc }) => [asc(b.name)],
      })
  );
}

export async function createBranchCore(
  params: {
    session: UserSession | null;
    authority: TenantAuthority | null;
    name: string;
    code?: string | null;
  },
  deps: UserDomainDeps = {}
) {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['branches.manage'], hasPermission);
  const authority = await resolveTenantAuthority(session, params.authority);
  const { tenantId } = readTenantAuthority(authority);

  const name = params.name.trim();
  if (!name) {
    return { error: 'Branch name is required' } satisfies ActionResult;
  }

  const slug = branchSlugFromName(name);

  if (!slug) {
    return { error: 'Invalid name generates empty slug' } satisfies ActionResult;
  }

  // Uniqueness Check
  const existing = await withTenantAuthority(
    authority,
    async tx =>
      await tx.query.branches.findFirst({
        where: withTenant(tenantId, branches.tenantId, eq(branches.slug, slug)),
      })
  );
  if (existing) {
    return { error: 'Branch with this name (slug) already exists' } satisfies ActionResult;
  }

  if (params.code) {
    const existingCode = await withTenantAuthority(
      authority,
      async tx =>
        await tx.query.branches.findFirst({
          where: withTenant(tenantId, branches.tenantId, eq(branches.code, params.code!)),
        })
    );
    if (existingCode) {
      return { error: 'Branch with this code already exists' } satisfies ActionResult;
    }
  }

  const branchId = randomUUID();
  const code = params.code?.trim() || null;

  // db-access-guard: tenant-scoped -- reason: tenantId from validated admin session before branch insert
  await withTenantAuthority(
    authority,
    async tx =>
      await tx.insert(branches).values({
        id: branchId,
        tenantId,
        name,
        code,
        slug,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
  );

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session!.user.id,
      actorRole: session!.user.role,
      action: 'branch.created',
      entityType: 'branch',
      entityId: branchId,
      authority,
      metadata: { name, code, slug },
    });
  }

  return { success: true, data: { branchId } } satisfies ActionResult<{ branchId: string }>;
}

export async function updateBranchCore(
  params: {
    session: UserSession | null;
    authority: TenantAuthority | null;
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
  const authority = await resolveTenantAuthority(session, params.authority);
  const { tenantId } = readTenantAuthority(authority);

  const name = params.name.trim();
  if (!name) {
    return { error: 'Branch name is required' } satisfies ActionResult;
  }

  const slug = branchSlugFromName(name);

  const existing = await withTenantAuthority(
    authority,
    async tx =>
      await tx.query.branches.findFirst({
        where: withTenant(tenantId, branches.tenantId, eq(branches.slug, slug)),
      })
  );
  if (existing && existing.id !== params.branchId) {
    return { error: 'Branch with this name (slug) already exists' } satisfies ActionResult;
  }

  if (params.code) {
    const existingCode = await withTenantAuthority(
      authority,
      async tx =>
        await tx.query.branches.findFirst({
          where: withTenant(tenantId, branches.tenantId, eq(branches.code, params.code!)),
        })
    );
    if (existingCode && existingCode.id !== params.branchId) {
      return { error: 'Branch with this code already exists' } satisfies ActionResult;
    }
  }

  await withTenantAuthority(
    authority,
    async tx =>
      await tx
        .update(branches)
        .set({
          name,
          slug,
          code: params.code?.trim() || null,
          isActive: params.isActive ?? true,
          updatedAt: new Date(),
        })
        .where(withTenant(tenantId, branches.tenantId, eq(branches.id, params.branchId)))
  );

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session!.user.id,
      actorRole: session!.user.role,
      action: 'branch.updated',
      entityType: 'branch',
      entityId: params.branchId,
      authority,
      metadata: { name, code: params.code, isActive: params.isActive },
    });
  }

  return { success: true } satisfies ActionResult;
}

export async function deleteBranchCore(
  params: {
    session: UserSession | null;
    authority: TenantAuthority | null;
    branchId: string;
  },
  deps: UserDomainDeps = {}
) {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['branches.manage'], hasPermission);
  const authority = await resolveTenantAuthority(session, params.authority);
  const { tenantId } = readTenantAuthority(authority);

  await withTenantAuthority(
    authority,
    async tx =>
      await tx
        .update(branches)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(withTenant(tenantId, branches.tenantId, eq(branches.id, params.branchId)))
  );

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session!.user.id,
      actorRole: session!.user.role,
      action: 'branch.deleted', // or branch.deactivated since it's soft delete
      entityType: 'branch',
      entityId: params.branchId,
      authority,
    });
  }

  return { success: true } satisfies ActionResult;
}
