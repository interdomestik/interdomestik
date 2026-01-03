import { and, branches, db, eq, user, userRoles } from '@interdomestik/database';
import { randomUUID } from 'crypto';
import { isNull } from 'drizzle-orm';

import { hasPermission, PERMISSIONS, requirePermission } from '@interdomestik/shared-auth';
import type { ActionResult, UserSession } from '../types';

const DEFAULT_TENANT_ID = 'tenant_mk';

function resolveTenantId(session: UserSession, requestedTenantId?: string | null): string {
  if (requestedTenantId) {
    if (session.user.role === 'super_admin') return requestedTenantId;

    // Non-super-admin users may only operate within their current tenant.
    if (session.user.tenantId && session.user.tenantId === requestedTenantId) {
      return requestedTenantId;
    }

    throw new Error('Unauthorized');
  }

  return session.user.tenantId ?? DEFAULT_TENANT_ID;
}

export async function listBranchesCore(params: {
  session: UserSession | null;
  tenantId?: string;
  includeInactive?: boolean;
}) {
  const session = params.session;
  requirePermission(session!, PERMISSIONS['branches.manage'], hasPermission);
  const tenantId = resolveTenantId(session!, params.tenantId);

  const whereConditions = [eq(branches.tenantId, tenantId)];
  if (!params.includeInactive) {
    whereConditions.push(eq(branches.isActive, true));
  }

  return db.query.branches.findMany({
    where: and(...whereConditions),
    orderBy: (b, { asc }) => [asc(b.name)],
  });
}

export async function createBranchCore(params: {
  session: UserSession | null;
  tenantId?: string;
  name: string;
  code?: string | null;
}) {
  const session = params.session;
  requirePermission(session!, PERMISSIONS['branches.manage'], hasPermission);
  const tenantId = resolveTenantId(session!, params.tenantId);

  const name = params.name.trim();
  if (!name) {
    return { error: 'Branch name is required' } satisfies ActionResult;
  }

  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) {
    return { error: 'Invalid name generates empty slug' } satisfies ActionResult;
  }

  // Uniqueness Check
  const existing = await db.query.branches.findFirst({
    where: and(eq(branches.slug, slug), eq(branches.tenantId, tenantId)),
  });
  if (existing) {
    return { error: 'Branch with this name (slug) already exists' } satisfies ActionResult;
  }

  if (params.code) {
    const existingCode = await db.query.branches.findFirst({
      where: and(eq(branches.code, params.code), eq(branches.tenantId, tenantId)),
    });
    if (existingCode) {
      return { error: 'Branch with this code already exists' } satisfies ActionResult;
    }
  }

  await db.insert(branches).values({
    id: randomUUID(),
    tenantId,
    name,
    code: params.code?.trim() || null,
    slug,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { success: true, data: { name, slug } } satisfies ActionResult;
}

export async function updateBranchCore(params: {
  session: UserSession | null;
  tenantId?: string;
  branchId: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
}) {
  const session = params.session;
  requirePermission(session!, PERMISSIONS['branches.manage'], hasPermission);
  const tenantId = resolveTenantId(session!, params.tenantId);

  const name = params.name.trim();
  if (!name) {
    return { error: 'Branch name is required' } satisfies ActionResult;
  }

  // Preserve slug logic or update it?
  // Usually slug should NOT change to keep URLs working, but if admin corrects typo...
  // User prompt implies uniqueness validation.
  // We'll regenerate slug from name for consistency, but check uniqueness excluding self.
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const existing = await db.query.branches.findFirst({
    where: and(eq(branches.slug, slug), eq(branches.tenantId, tenantId)),
  });
  if (existing && existing.id !== params.branchId) {
    return { error: 'Branch with this name (slug) already exists' } satisfies ActionResult;
  }

  if (params.code) {
    const existingCode = await db.query.branches.findFirst({
      where: and(eq(branches.code, params.code), eq(branches.tenantId, tenantId)),
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
    .where(and(eq(branches.id, params.branchId), eq(branches.tenantId, tenantId)));

  return { success: true } satisfies ActionResult;
}

export async function deleteBranchCore(params: {
  session: UserSession | null;
  tenantId?: string;
  branchId: string;
}) {
  const session = params.session;
  requirePermission(session!, PERMISSIONS['branches.manage'], hasPermission);
  const tenantId = resolveTenantId(session!, params.tenantId);

  // Soft delete semantics as requested
  console.log(
    `[AUDIT] Branch deactivated: ${params.branchId} by User: ${session?.user.id} at ${new Date().toISOString()}`
  );

  await db
    .update(branches)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(and(eq(branches.id, params.branchId), eq(branches.tenantId, tenantId)));

  return { success: true } satisfies ActionResult;
}

export async function listUserRolesCore(params: {
  session: UserSession | null;
  tenantId?: string;
  userId?: string;
}) {
  const session = params.session;
  requirePermission(session!, PERMISSIONS['roles.manage'], hasPermission);
  const tenantId = resolveTenantId(session!, params.tenantId);

  if (params.userId) {
    return db.query.userRoles.findMany({
      where: and(eq(userRoles.tenantId, tenantId), eq(userRoles.userId, params.userId)),
    });
  }

  return db.query.userRoles.findMany({
    where: eq(userRoles.tenantId, tenantId),
  });
}

export async function grantUserRoleCore(params: {
  session: UserSession | null;
  tenantId?: string;
  userId: string;
  role: string;
  branchId?: string | null;
}): Promise<ActionResult> {
  const session = params.session;
  requirePermission(session!, PERMISSIONS['roles.manage'], hasPermission);
  const tenantId = resolveTenantId(session!, params.tenantId);

  const role = params.role.trim();
  if (!role) return { error: 'Role is required' };

  // Ensure branch belongs to this tenant and is ACTIVE (when provided).
  let branchId = params.branchId ?? null;
  if (branchId) {
    const branch = await db.query.branches.findFirst({
      where: and(eq(branches.id, branchId), eq(branches.tenantId, tenantId)),
    });
    if (!branch) return { error: 'Invalid branch' };
    if (!branch.isActive) return { error: 'Cannot assign role to inactive branch' };
  }

  // Branch Scoping Rules
  if (role === 'branch_manager' || role === 'agent') {
    if (!branchId) return { error: `Branch is required for role: ${role}` };
  } else {
    // For non-branch roles (admin, staff), ensure branchId is null (unless we allow branch-staff later)
    // For now, clean it up to avoid confusion.
    branchId = null;
  }

  await db.transaction(async tx => {
    // 1. Update user table (Source of Truth for Session)
    // We treat this grant as setting the PRIMARY role.
    await tx
      .update(user)
      .set({
        role,
        branchId,
        updatedAt: new Date(),
      })
      .where(eq(user.id, params.userId));

    // 2. Add to userRoles (Audit/Multi-role future safe)
    // First remove existing entry for same role to avoid duplicates if any
    await tx
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.tenantId, tenantId),
          eq(userRoles.userId, params.userId),
          eq(userRoles.role, role)
        )
      );

    await tx.insert(userRoles).values({
      id: randomUUID(),
      tenantId,
      userId: params.userId,
      role,
      branchId,
    });
  });

  return { success: true };
}

export async function revokeUserRoleCore(params: {
  session: UserSession | null;
  tenantId?: string;
  userId: string;
  role: string;
  branchId?: string | null;
}): Promise<ActionResult> {
  const session = params.session;
  requirePermission(session!, PERMISSIONS['roles.manage'], hasPermission);
  const tenantId = resolveTenantId(session!, params.tenantId);

  const role = params.role.trim();
  if (!role) return { error: 'Role is required' };

  const branchId = params.branchId ?? null;

  await db
    .delete(userRoles)
    .where(
      and(
        eq(userRoles.tenantId, tenantId),
        eq(userRoles.userId, params.userId),
        eq(userRoles.role, role),
        branchId == null ? isNull(userRoles.branchId) : eq(userRoles.branchId, branchId)
      )
    );

  return { success: true };
}
