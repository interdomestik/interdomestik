import { and, branches, eq, user, userRoles } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { hasPermission, PERMISSIONS, requirePermission } from '@interdomestik/shared-auth';
import { isNull } from 'drizzle-orm';
import type { ActionResult, UserDomainDeps, UserSession } from '../types';
import { conflictsWithBranchMembership, revokeLeavesForeignBranchGrant } from './branch-membership';
import { createRoleAssignmentId } from './role-id';
import { resolveRoleMutationContext } from './role-mutation-context';
import {
  BRANCH_MEMBERSHIP_CONFLICT,
  canManageAssignedRole,
  isBranchRequiredRole,
} from './role-rules';
import { lockRoleMutationTarget } from './role-target';
import { resolveTenantAuthority } from './utils';

export async function listUserRolesCore(params: {
  session: UserSession | null;
  authority: TenantAuthority | null;
  userId?: string;
}) {
  const session = params.session;
  if (!session) throw new Error('Unauthorized');
  requirePermission(session, PERMISSIONS['roles.manage'], hasPermission);
  const authority = await resolveTenantAuthority(session, params.authority);
  const { tenantId } = readTenantAuthority(authority);

  return withTenantAuthority(authority, async tx => {
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
    authority: TenantAuthority | null;
    userId: string;
    role: string;
    branchId?: string | null;
    allowLegacyTenantWide?: boolean;
  },
  deps: UserDomainDeps = {}
): Promise<ActionResult> {
  const context = await resolveRoleMutationContext(params, 'granted');
  if ('error' in context) return context;
  const { session, authority, tenantId, role } = context;

  let branchId = params.branchId ?? null;
  if (branchId) {
    const branchIdForLookup = branchId;
    const branch = await withTenantAuthority(authority, tx =>
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

  const granted = await withTenantAuthority(authority, async tx => {
    const target = await lockRoleMutationTarget(tx, tenantId, params.userId, session.user.role);
    if (!target) return 'denied';
    if (branchId && conflictsWithBranchMembership(target, branchId)) return 'branch-conflict';

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
    return 'granted';
  });

  if (granted === 'denied') return { error: 'Role cannot be granted' };
  if (granted === 'branch-conflict') return { ...BRANCH_MEMBERSHIP_CONFLICT };

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session!.user.id,
      actorRole: session!.user.role,
      action: 'user.role_granted',
      entityType: 'user',
      entityId: params.userId,
      authority,
      metadata: { role, branchId },
    });
  }

  return { success: true };
}

export async function revokeUserRoleCore(
  params: {
    session: UserSession | null;
    authority: TenantAuthority | null;
    userId: string;
    role: string;
    branchId?: string | null;
  },
  deps: UserDomainDeps = {}
): Promise<ActionResult> {
  const context = await resolveRoleMutationContext(params, 'revoked');
  if ('error' in context) return context;
  const { session, authority, tenantId, role } = context;

  const branchId = params.branchId ?? null;
  const revokeResult = await withTenantAuthority(authority, async tx => {
    const target = await lockRoleMutationTarget(tx, tenantId, params.userId, session.user.role);
    if (!target) return { denied: true, deleted: [] };
    if (revokeLeavesForeignBranchGrant(target, { role, branchId })) {
      return { denied: false, branchConflict: true, deleted: [] };
    }

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
      return { denied: false, deleted };
    }

    // Keep session-authoritative role fields coherent with role revocations.
    if (target.role === role) {
      const remainingRoles = await tx.query.userRoles.findMany({
        where: withTenant(tenantId, userRoles.tenantId, eq(userRoles.userId, params.userId)),
        columns: { role: true, branchId: true },
      });

      const nextPrimaryRole = remainingRoles.find(r => r.role !== role) ?? null;
      const nextRole = nextPrimaryRole?.role ?? 'member';
      if (!canManageAssignedRole(session.user.role, nextRole)) {
        // Throw so the tenant transaction rolls back the preceding assignment delete.
        throw new Error('Role cannot be revoked');
      }
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

    return { denied: false, deleted };
  });

  if (revokeResult.denied) return { error: 'Role cannot be revoked' };
  if ('branchConflict' in revokeResult) return { ...BRANCH_MEMBERSHIP_CONFLICT };
  if (revokeResult.deleted.length === 0) {
    return { error: 'Role revoke did not persist' };
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session!.user.id,
      actorRole: session!.user.role,
      action: 'user.role_revoked',
      entityType: 'user',
      entityId: params.userId,
      authority,
      metadata: { role, branchId },
    });
  }

  return { success: true };
}
