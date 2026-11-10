'use server';

import { logAuditEvent } from '@/lib/audit';
import { runAuthenticatedAction, type ActionResult } from '@/lib/safe-action';
import { requireEffectivePortalAccessOrUnauthorized } from '@/server/auth/effective-portal-access';

import {
  createGuardedBranchCore as createBranchDomain,
  deleteBranchCore as deleteBranchDomain,
  grantUserRoleCore as grantUserRoleDomain,
  listBranchesCore as listBranchesDomain,
  listUserRolesCore as listUserRolesDomain,
  revokeUserRoleCore as revokeUserRoleDomain,
  updateGuardedBranchCore as updateBranchDomain,
} from '@interdomestik/domain-users/admin/rbac';
import { isBranchRequiredRole } from '@interdomestik/domain-users/admin/role-rules';
import {
  createBranchSchema,
  listBranchesSchema,
  updateBranchSchema,
} from '@interdomestik/domain-users/admin/schemas';
import type { UserSession } from '@interdomestik/domain-users/types';
import { z } from 'zod';
import {
  revalidateAdminUserPage,
  resolveTenantForAdminAction,
  resolveAdminActionAuthority,
} from './admin-rbac-authority';

export async function listBranches(params?: {
  tenantId?: string;
  includeInactive?: boolean;
}): ActionResult<Awaited<ReturnType<typeof listBranchesDomain>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof listBranchesDomain>>>(
    async ({ session, authority }) => {
      const validation = listBranchesSchema.safeParse(params || {});
      if (!validation.success) {
        throw new Error('Validation failed');
      }
      const resolvedTenantId = resolveTenantForAdminAction(
        session,
        validation.data.tenantId,
        session.user?.role
      );
      await requireEffectivePortalAccessOrUnauthorized(
        session,
        ['admin', 'tenant_admin', 'super_admin'],
        { requestedTenantId: resolvedTenantId }
      );

      // cast session to compatible UserSession type
      const data = await listBranchesDomain({
        session: session as unknown as UserSession,
        authority: await resolveAdminActionAuthority(session, authority, validation.data.tenantId),
        includeInactive: validation.data.includeInactive,
      });
      return data;
    }
  );
}

export async function createBranch(
  data: z.infer<typeof createBranchSchema>
): ActionResult<Awaited<ReturnType<typeof createBranchDomain>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof createBranchDomain>>>(
    async ({ session, authority }) => {
      const validation = createBranchSchema.safeParse(data);
      if (!validation.success) {
        throw new Error(validation.error.message);
      }
      const resolvedTenantId = resolveTenantForAdminAction(
        session,
        validation.data.tenantId,
        session.user?.role
      );
      await requireEffectivePortalAccessOrUnauthorized(
        session,
        ['admin', 'tenant_admin', 'super_admin'],
        { requestedTenantId: resolvedTenantId }
      );

      // The pilot single-branch policy lives in the guarded writers.
      const result = await createBranchDomain(
        {
          session: session as unknown as UserSession,
          authority: await resolveAdminActionAuthority(
            session,
            authority,
            validation.data.tenantId
          ),
          name: validation.data.name,
          code: validation.data.code ?? null,
        },
        { logAuditEvent }
      );

      if ('error' in result) {
        if ('code' in result && result.code === 'single_branch_limit') {
          return { success: false as const, error: result.error, code: result.code };
        }
        return { error: String(result.error) };
      }
      return result;
    }
  );
}

export async function updateBranch({
  branchId,
  data,
}: {
  branchId: string;
  data: Omit<z.infer<typeof updateBranchSchema>, 'branchId'>;
}): ActionResult<Awaited<ReturnType<typeof updateBranchDomain>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof updateBranchDomain>>>(
    async ({ session, authority }) => {
      // Validate data before passing to domain
      const fullData = { ...data, branchId };
      const validation = updateBranchSchema.safeParse(fullData);

      if (!validation.success) {
        throw new Error(validation.error.message);
      }
      const resolvedTenantId = resolveTenantForAdminAction(
        session,
        validation.data.tenantId,
        session.user?.role
      );
      await requireEffectivePortalAccessOrUnauthorized(
        session,
        ['admin', 'tenant_admin', 'super_admin'],
        { requestedTenantId: resolvedTenantId }
      );

      const { tenantId: clientTenantId, ...branchChanges } = validation.data;
      // The pilot single-branch policy lives in the guarded writers.
      const result = await updateBranchDomain(
        {
          session: session as unknown as UserSession,
          authority: await resolveAdminActionAuthority(session, authority, clientTenantId),
          ...branchChanges,
        },
        { logAuditEvent }
      );

      if ('error' in result) {
        if ('code' in result && result.code === 'single_branch_limit') {
          return { success: false as const, error: result.error, code: result.code };
        }
        throw new Error(String(result.error));
      }

      return result;
    }
  );
}

export async function deleteBranch({ branchId }: { branchId: string }): ActionResult<void> {
  return runAuthenticatedAction<void>(async ({ session, authority }) => {
    await requireEffectivePortalAccessOrUnauthorized(session, [
      'admin',
      'tenant_admin',
      'super_admin',
    ]);
    const result = await deleteBranchDomain({
      session: session as unknown as UserSession,
      authority,
      branchId,
    });

    if ('error' in result) {
      throw new Error(String(result.error));
    }
  });
}

export async function listUserRoles({
  userId,
  tenantId,
}: {
  userId: string;
  tenantId?: string;
}): ActionResult<Awaited<ReturnType<typeof listUserRolesDomain>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof listUserRolesDomain>>>(
    async ({ session, authority }) => {
      const resolvedTenantId = resolveTenantForAdminAction(session, tenantId, session.user?.role);
      await requireEffectivePortalAccessOrUnauthorized(
        session,
        ['admin', 'tenant_admin', 'super_admin'],
        { requestedTenantId: resolvedTenantId }
      );
      const data = await listUserRolesDomain({
        session: session as unknown as UserSession,
        authority: await resolveAdminActionAuthority(session, authority, tenantId),
        userId,
      });
      return data;
    }
  );
}

// Grants a role in the target tenant. Agents and branch managers always need a branch:
// there is no tenant-wide agent grant.
export async function grantUserRole({
  userId,
  role,
  branchId,
  tenantId,
  locale,
}: {
  userId: string;
  role: string;
  branchId?: string;
  tenantId?: string;
  locale?: string;
}): ActionResult<void> {
  return runAuthenticatedAction<void>(async ({ session, authority }) => {
    const resolvedTenantId = resolveTenantForAdminAction(session, tenantId, session.user?.role);
    await requireEffectivePortalAccessOrUnauthorized(
      session,
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: resolvedTenantId }
    );
    // Fail before any write, with a code the roles panel can explain.
    if (isBranchRequiredRole(role) && !branchId) {
      return {
        success: false,
        error: `Branch is required for role: ${role}`,
        code: 'BRANCH_REQUIRED',
      } as never;
    }

    const result = await grantUserRoleDomain({
      session: session as unknown as UserSession,
      authority: await resolveAdminActionAuthority(session, authority, tenantId),
      userId,
      role,
      branchId,
    });

    if ('error' in result) {
      return roleMutationFailure(result);
    }

    revalidateAdminUserPage(locale, userId);
  });
}

export async function revokeUserRole({
  userId,
  role,
  branchId,
  tenantId,
  locale,
}: {
  userId: string;
  role: string;
  branchId?: string;
  tenantId?: string;
  locale?: string;
}): ActionResult<void> {
  return runAuthenticatedAction<void>(async ({ session, authority }) => {
    const resolvedTenantId = resolveTenantForAdminAction(session, tenantId, session.user?.role);
    await requireEffectivePortalAccessOrUnauthorized(
      session,
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: resolvedTenantId }
    );
    const result = await revokeUserRoleDomain({
      session: session as unknown as UserSession,
      authority: await resolveAdminActionAuthority(session, authority, tenantId),
      userId,
      role,
      branchId,
    });

    if ('error' in result) {
      return roleMutationFailure(result);
    }

    revalidateAdminUserPage(locale, userId);
  });
}

// A branch membership conflict is an expected outcome the roles panel explains; others throw.
function roleMutationFailure(result: { error: string; code?: string }): never {
  if (result.code !== 'BRANCH_MEMBERSHIP_CONFLICT') throw new Error(result.error);
  return { success: false, error: result.error, code: result.code } as never;
}
