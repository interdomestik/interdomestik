import { and, branches, db, eq, user, userRoles } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { hasPermission, PERMISSIONS, requirePermission } from '@interdomestik/shared-auth';
import { isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto'; // NOSONAR
import type { ActionResult, UserDomainDeps, UserSession } from '../types';
import { isBranchRequiredRole } from './role-rules';
import { resolveTenantId } from './utils';

export async function listUserRolesCore(params: {
  session: UserSession | null;
  tenantId?: string;
  userId?: string;
}) {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['roles.manage'], hasPermission);
  const tenantId = resolveTenantId(session, params.tenantId);

  if (params.userId) {
    return db.query.userRoles.findMany({
      where: withTenant(tenantId, userRoles.tenantId, eq(userRoles.userId, params.userId)),
    });
  }

  return db.query.userRoles.findMany({
    where: withTenant(tenantId, userRoles.tenantId),
  });
}

export async function grantUserRoleCore(
  params: {
    session: UserSession | null;
    tenantId?: string;
    userId: string;
    role: string;
    branchId?: string | null;
  },
  deps: UserDomainDeps = {}
): Promise<ActionResult> {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['roles.manage'], hasPermission);
  const tenantId = resolveTenantId(session, params.tenantId);

  const role = params.role.trim();
  if (!role) return { error: 'Role is required' };

  // Ensure branch belongs to this tenant and is ACTIVE (when provided).
  let branchId = params.branchId ?? null;
  if (branchId) {
    const branch = await db.query.branches.findFirst({
      where: withTenant(tenantId, branches.tenantId, eq(branches.id, branchId)),
    });
    if (!branch) return { error: 'Invalid branch' };
    if (!branch.isActive) return { error: 'Cannot assign role to inactive branch' };
  }

  // Branch Scoping Rules
  if (isBranchRequiredRole(role)) {
    if (!branchId) return { error: `Branch is required for role: ${role}` };
  } else {
    // For non-branch roles (admin, staff), ensure branchId is null (unless we allow branch-staff later)
    // For now, clean it up to avoid confusion.
    branchId = null;
  }

  await db.transaction(async tx => {
    // 1. Update user table (Source of Truth for Session)
    // We treat this grant as setting the PRIMARY role.
    const updatedUsers = await tx
      .update(user)
      .set({
        role,
        branchId,
        updatedAt: new Date(),
      })
      .where(withTenant(tenantId, user.tenantId, eq(user.id, params.userId)))
      .returning({ id: user.id });
    if (updatedUsers.length === 0) {
      throw new Error('Role grant did not update the user');
    }

    // 2. Add to userRoles (Audit/Multi-role future safe)
    // First remove existing entry for same role to avoid duplicates if any
    await tx
      .delete(userRoles)
      .where(
        withTenant(
          tenantId,
          userRoles.tenantId,
          and(eq(userRoles.userId, params.userId), eq(userRoles.role, role))
        )
      );

    const insertedRoles = await tx
      .insert(userRoles)
      .values({
        id: randomUUID(),
        tenantId,
        userId: params.userId,
        role,
        branchId,
      })
      .returning({ id: userRoles.id });

    if (insertedRoles.length === 0) {
      throw new Error('Role grant did not persist');
    }
  });

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session!.user.id,
      actorRole: session!.user.role,
      action: 'user.role_granted',
      entityType: 'user',
      entityId: params.userId,
      tenantId,
      metadata: { role, branchId },
    });
  }

  return { success: true };
}

export async function revokeUserRoleCore(
  params: {
    session: UserSession | null;
    tenantId?: string;
    userId: string;
    role: string;
    branchId?: string | null;
  },
  deps: UserDomainDeps = {}
): Promise<ActionResult> {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['roles.manage'], hasPermission);
  const tenantId = resolveTenantId(session, params.tenantId);

  const role = params.role.trim();
  if (!role) return { error: 'Role is required' };

  const branchId = params.branchId ?? null;

  const deletedRoles = await db
    .delete(userRoles)
    .where(
      withTenant(
        tenantId,
        userRoles.tenantId,
        and(
          eq(userRoles.userId, params.userId),
          eq(userRoles.role, role),
          eq(userRoles.role, role),
          branchId === null || branchId === undefined
            ? isNull(userRoles.branchId)
            : eq(userRoles.branchId, branchId)
        )
      )
    )
    .returning({ id: userRoles.id });

  if (deletedRoles.length === 0) {
    return { error: 'Role revoke did not persist' };
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session!.user.id,
      actorRole: session!.user.role,
      action: 'user.role_revoked',
      entityType: 'user',
      entityId: params.userId,
      tenantId,
      metadata: { role, branchId },
    });
  }

  return { success: true };
}
