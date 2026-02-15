'use server';

import { logAuditEvent } from '@/lib/audit';
import { runAuthenticatedAction, type ActionResult } from '@/lib/safe-action';
import { requireEffectivePortalAccessOrUnauthorized } from '@/server/auth/effective-portal-access';
import { revalidatePath } from 'next/cache';
import {
  createBranchCore as createBranchDomain,
  deleteBranchCore as deleteBranchDomain,
  grantUserRoleCore as grantUserRoleDomain,
  listBranchesCore as listBranchesDomain,
  listUserRolesCore as listUserRolesDomain,
  revokeUserRoleCore as revokeUserRoleDomain,
  updateBranchCore as updateBranchDomain,
} from '@interdomestik/domain-users/admin/rbac';
import { isBranchRequiredRole } from '@interdomestik/domain-users/admin/role-rules';
import {
  createBranchSchema,
  listBranchesSchema,
  updateBranchSchema,
} from '@interdomestik/domain-users/admin/schemas';
import type { UserSession } from '@interdomestik/domain-users/types';
import { z } from 'zod';

function revalidateAdminUserPage(locale: string | undefined, userId: string) {
  if (locale) {
    revalidatePath(`/${locale}/admin/users/${userId}`);
    revalidatePath(`/${locale}/admin/users`);
  }
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath('/admin/users');
}

function resolveTenantForAdminAction(
  session: { user?: { tenantId?: string | null } | null },
  tenantId?: string,
  role?: string
): string | undefined {
  const sessionTenantId = session.user?.tenantId ?? undefined;
  if (role === 'super_admin') {
    return tenantId ?? sessionTenantId;
  }
  return sessionTenantId ?? tenantId;
}

export async function listBranches(params?: {
  tenantId?: string;
  includeInactive?: boolean;
}): ActionResult<Awaited<ReturnType<typeof listBranchesDomain>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof listBranchesDomain>>>(
    async ({ session }) => {
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
        tenantId: resolvedTenantId,
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
    async ({ session }) => {
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

      // Unpack data for domain function
      const result = await createBranchDomain(
        {
          session: session as unknown as UserSession,
          tenantId: resolvedTenantId,
          name: validation.data.name,
          code: validation.data.code ?? null,
        },
        { logAuditEvent }
      );

      if ('error' in result) {
        throw new Error(String(result.error));
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
    async ({ session }) => {
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

      const result = await updateBranchDomain({
        session: session as unknown as UserSession,
        ...validation.data,
        tenantId: resolvedTenantId,
      });

      if ('error' in result) {
        throw new Error(String(result.error));
      }

      return result;
    }
  );
}

export async function deleteBranch({ branchId }: { branchId: string }): ActionResult<void> {
  return runAuthenticatedAction<void>(async ({ session }) => {
    await requireEffectivePortalAccessOrUnauthorized(session, [
      'admin',
      'tenant_admin',
      'super_admin',
    ]);
    const result = await deleteBranchDomain({
      session: session as unknown as UserSession,
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
    async ({ session }) => {
      const resolvedTenantId = resolveTenantForAdminAction(session, tenantId, session.user?.role);
      await requireEffectivePortalAccessOrUnauthorized(
        session,
        ['admin', 'tenant_admin', 'super_admin'],
        { requestedTenantId: resolvedTenantId }
      );
      const data = await listUserRolesDomain({
        session: session as unknown as UserSession,
        userId,
        tenantId: resolvedTenantId,
      });
      return data;
    }
  );
}

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
  return runAuthenticatedAction<void>(async ({ session }) => {
    const resolvedTenantId = resolveTenantForAdminAction(session, tenantId, session.user?.role);
    await requireEffectivePortalAccessOrUnauthorized(
      session,
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: resolvedTenantId }
    );
    if (isBranchRequiredRole(role) && !branchId) {
      return {
        success: false,
        error: `Branch is required for role: ${role}`,
        code: 'BRANCH_REQUIRED',
      } as never;
    }

    const result = await grantUserRoleDomain({
      session: session as unknown as UserSession,
      userId,
      role,
      branchId,
      tenantId: resolvedTenantId,
    });

    if ('error' in result) {
      throw new Error(result.error);
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
  return runAuthenticatedAction<void>(async ({ session }) => {
    const resolvedTenantId = resolveTenantForAdminAction(session, tenantId, session.user?.role);
    await requireEffectivePortalAccessOrUnauthorized(
      session,
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: resolvedTenantId }
    );
    const result = await revokeUserRoleDomain({
      session: session as unknown as UserSession,
      userId,
      role,
      branchId,
      tenantId: resolvedTenantId,
    });

    if ('error' in result) {
      throw new Error(result.error);
    }

    revalidateAdminUserPage(locale, userId);
  });
}
