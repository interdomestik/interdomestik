'use server';

import { delegateSuperAdminTenant } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';

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
  session: { user?: { accessTenantId?: string | null; tenantId?: string | null } | null },
  tenantId?: string,
  role?: string
): string | undefined {
  const sessionTenantId = session.user?.accessTenantId?.trim() || session.user?.tenantId?.trim();
  if (role === 'super_admin') {
    return tenantId ?? sessionTenantId;
  }
  return sessionTenantId ?? tenantId;
}

/**
 * The authority an admin action runs under. The client-supplied tenant id never chooses the tenant:
 * a non-super_admin always uses the session authority; a super_admin naming another tenant gets a
 * delegation minted by the platform directory, and an unknown or inactive tenant fails closed.
 */
async function resolveAdminActionAuthority(
  session: { user?: { role?: string | null } | null },
  authority: TenantAuthority,
  clientTenantId?: string | null
): Promise<TenantAuthority> {
  const requested = clientTenantId?.trim();
  if (session.user?.role !== 'super_admin' || !requested) return authority;
  if (requested === readTenantAuthority(authority).tenantId) return authority;
  const delegated = await delegateSuperAdminTenant(authority, requested);
  if (!delegated) throw new Error('Unauthorized');
  return delegated;
}

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

      // Unpack data for domain function
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
      const result = await updateBranchDomain({
        session: session as unknown as UserSession,
        authority: await resolveAdminActionAuthority(session, authority, clientTenantId),
        ...branchChanges,
      });

      if ('error' in result) {
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

export async function grantUserRole({
  userId,
  role,
  branchId,
  tenantId,
  locale,
  allowLegacyTenantWide,
}: {
  userId: string;
  role: string;
  branchId?: string;
  tenantId?: string;
  locale?: string;
  allowLegacyTenantWide?: boolean;
}): ActionResult<void> {
  return runAuthenticatedAction<void>(async ({ session, authority }) => {
    const resolvedTenantId = resolveTenantForAdminAction(session, tenantId, session.user?.role);
    await requireEffectivePortalAccessOrUnauthorized(
      session,
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: resolvedTenantId }
    );
    if (isBranchRequiredRole(role) && !branchId && !allowLegacyTenantWide) {
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
      allowLegacyTenantWide,
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
      throw new Error(result.error);
    }

    revalidateAdminUserPage(locale, userId);
  });
}
