import { and, branches, db, eq, user, userRoles, withTenantContext } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { hasPermission, PERMISSIONS, requirePermission } from '@interdomestik/shared-auth';
import { isNull } from 'drizzle-orm';
import type { ActionResult, UserDomainDeps, UserSession } from '../types';
import { createRoleAssignmentId } from './role-id';
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

  return withTenantContext({ tenantId, role: session.user.role }, async tx => {
    if (params.userId) {
      const explicitRoles = await tx.query.userRoles.findMany({
        where: withTenant(tenantId, userRoles.tenantId, eq(userRoles.userId, params.userId)),
      });

      const legacyUser = await tx.query.user.findFirst({
        where: withTenant(tenantId, user.tenantId, eq(user.id, params.userId)),
        columns: {
          id: true,
          role: true,
          branchId: true,
        },
      });

      if (!legacyUser || !legacyUser.role || legacyUser.role === 'member') {
        return explicitRoles;
      }

      const hasPrimaryRoleRow = explicitRoles.some(
        row => row.role === legacyUser.role && row.branchId === (legacyUser.branchId ?? null)
      );

      if (hasPrimaryRoleRow) {
        return explicitRoles;
      }

      const legacyPrimaryRole = [
        {
          id: `legacy-${legacyUser.id}-${legacyUser.role}-${legacyUser.branchId ?? 'tenant'}`,
          tenantId,
          userId: legacyUser.id,
          role: legacyUser.role,
          branchId: legacyUser.branchId ?? null,
        },
      ];

      return [...legacyPrimaryRole, ...explicitRoles];
    }

    return tx.query.userRoles.findMany({
      where: withTenant(tenantId, userRoles.tenantId),
    });
  });
}

export async function grantUserRoleCore(
  params: {
    session: UserSession | null;
    tenantId?: string;
    userId: string;
    role: string;
    branchId?: string | null;
    allowLegacyTenantWide?: boolean;
  },
  deps: UserDomainDeps = {}
): Promise<ActionResult> {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['roles.manage'], hasPermission);
  const tenantId = resolveTenantId(session, params.tenantId);

  const role = params.role.trim();
  if (!role) return { error: 'Role is required' };

  let branchId = params.branchId ?? null;
  if (branchId) {
    const branchIdForLookup = branchId;
    const branch = await withTenantContext({ tenantId, role: session.user.role }, tx =>
      tx.query.branches.findFirst({
        where: withTenant(tenantId, branches.tenantId, eq(branches.id, branchIdForLookup)),
      })
    );
    if (!branch) return { error: 'Invalid branch' };
    if (!branch.isActive) return { error: 'Cannot assign role to inactive branch' };
  }

  if (isBranchRequiredRole(role)) {
    if (params.allowLegacyTenantWide && role === 'agent' && !branchId) {
      branchId = null;
    } else if (!branchId) {
      return { error: `Branch is required for role: ${role}` };
    }
  } else {
    branchId = null;
  }

  await withTenantContext({ tenantId, role: session.user.role }, async tx => {
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

    await tx
      .delete(userRoles)
      .where(
        withTenant(
          tenantId,
          userRoles.tenantId,
          and(eq(userRoles.userId, params.userId), eq(userRoles.role, role))
        )
      );

    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    const insertedRoles = await tx
      .insert(userRoles)
      .values({
        id: createRoleAssignmentId(),
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
  const deletedRoles = await withTenantContext({ tenantId, role: session.user.role }, async tx => {
    const roleDeleteScope =
      branchId === null ? isNull(userRoles.branchId) : eq(userRoles.branchId, branchId);

    const deleted = await tx
      .delete(userRoles)
      .where(
        withTenant(
          tenantId,
          userRoles.tenantId,
          and(eq(userRoles.userId, params.userId), eq(userRoles.role, role), roleDeleteScope)
        )
      )
      .returning({ id: userRoles.id });

    if (deleted.length === 0) {
      return deleted;
    }

    const targetUser = await tx.query.user.findFirst({
      where: withTenant(tenantId, user.tenantId, eq(user.id, params.userId)),
      columns: { role: true },
    });

    if (!targetUser) {
      throw new Error('Target user not found');
    }

    // Keep session-authoritative role fields coherent with role revocations.
    if (targetUser.role === role) {
      const remainingRoles = await tx.query.userRoles.findMany({
        where: withTenant(tenantId, userRoles.tenantId, eq(userRoles.userId, params.userId)),
        columns: { role: true, branchId: true },
      });

      const nextPrimaryRole = remainingRoles.find(r => r.role !== role) ?? null;
      const nextRole = nextPrimaryRole?.role ?? 'member';
      const nextBranchId = isBranchRequiredRole(nextRole)
        ? (nextPrimaryRole?.branchId ?? null)
        : null;

      await tx
        .update(user)
        .set({
          role: nextRole,
          branchId: nextBranchId,
          updatedAt: new Date(),
        })
        .where(withTenant(tenantId, user.tenantId, eq(user.id, params.userId)));
    }

    return deleted;
  });

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
