'use server';

import { logAuditEvent } from '@/lib/audit';
import type { ActionResult } from '@/types/actions';
import {
  createBranchCore as createBranchDomain,
  deleteBranchCore as deleteBranchDomain,
  grantUserRoleCore as grantUserRoleDomain,
  listBranchesCore as listBranchesDomain,
  listUserRolesCore as listUserRolesDomain,
  revokeUserRoleCore as revokeUserRoleDomain,
  updateBranchCore as updateBranchDomain,
} from '@interdomestik/domain-users/admin/rbac';
import {
  createBranchSchema,
  deleteBranchSchema,
  grantRoleSchema,
  listBranchesSchema,
  listUserRolesSchema,
  revokeRoleSchema,
  updateBranchSchema,
} from '@interdomestik/domain-users/admin/schemas';
import type { UserSession } from '@interdomestik/domain-users/types';

import { getActionContext } from './admin-users/context';

export async function listBranches(params?: {
  tenantId?: string;
  includeInactive?: boolean;
}): Promise<ActionResult<Awaited<ReturnType<typeof listBranchesDomain>>>> {
  try {
    const { session } = await getActionContext();

    const validation = listBranchesSchema.safeParse(params || {});
    if (!validation.success) {
      return { success: false, error: 'Validation failed' };
    }

    const data = await listBranchesDomain({
      session: session as UserSession | null,
      tenantId: params?.tenantId,
      includeInactive: params?.includeInactive,
    });
    return { success: true, data };
  } catch (err) {
    console.error('[Action:listBranches]', err);
    return { success: false, error: 'Failed to retrieve branches' };
  }
}

export async function createBranch(params: {
  tenantId?: string;
  name: string;
  code?: string | null;
}): Promise<ActionResult<Awaited<ReturnType<typeof createBranchDomain>>>> {
  try {
    const { session } = await getActionContext();

    const validation = createBranchSchema.safeParse(params);
    if (!validation.success) {
      return { success: false, error: 'Validation failed' };
    }

    const result = await createBranchDomain(
      {
        session: session as UserSession | null,
        tenantId: params.tenantId,
        name: params.name,
        code: params.code ?? null,
      },
      { logAuditEvent }
    );

    if ('error' in result) {
      return { success: false, error: String(result.error || 'Unknown error') };
    }
    return { success: true, data: result };
  } catch (err) {
    console.error('[Action:createBranch]', err);
    return { success: false, error: 'Failed to create branch' };
  }
}

export async function updateBranch(params: {
  tenantId?: string;
  branchId: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
}): Promise<ActionResult<Awaited<ReturnType<typeof updateBranchDomain>>>> {
  try {
    const { session } = await getActionContext();

    const validation = updateBranchSchema.safeParse(params);
    if (!validation.success) {
      return { success: false, error: 'Validation failed' };
    }

    const result = await updateBranchDomain(
      {
        session: session as UserSession | null,
        tenantId: params.tenantId,
        branchId: params.branchId,
        name: params.name,
        code: params.code ?? null,
        isActive: params.isActive,
      },
      { logAuditEvent }
    );

    if ('error' in result) {
      return { success: false, error: String(result.error || 'Unknown error') };
    }
    return { success: true, data: result };
  } catch (err) {
    console.error('[Action:updateBranch]', err);
    return { success: false, error: 'Failed to update branch' };
  }
}

export async function deleteBranch(params: {
  tenantId?: string;
  branchId: string;
}): Promise<ActionResult<void>> {
  try {
    const { session } = await getActionContext();

    const validation = deleteBranchSchema.safeParse(params);
    if (!validation.success) {
      return { success: false, error: 'Validation failed' };
    }

    const result = await deleteBranchDomain(
      {
        session: session as UserSession | null,
        tenantId: params.tenantId,
        branchId: params.branchId,
      },
      { logAuditEvent }
    );

    if ('error' in result) {
      return { success: false, error: String(result.error || 'Unknown error') };
    }
    return { success: true, data: undefined };
  } catch (err) {
    console.error('[Action:deleteBranch]', err);
    return { success: false, error: 'Failed to delete branch' };
  }
}

export async function listUserRoles(params?: {
  tenantId?: string;
  userId?: string;
}): Promise<ActionResult<Awaited<ReturnType<typeof listUserRolesDomain>>>> {
  try {
    const { session } = await getActionContext();

    const validation = listUserRolesSchema.safeParse(params || {});
    if (!validation.success) {
      return { success: false, error: 'Validation failed' };
    }

    const data = await listUserRolesDomain({
      session: session as UserSession | null,
      tenantId: params?.tenantId,
      userId: params?.userId,
    });
    return { success: true, data };
  } catch (err) {
    console.error('[Action:listUserRoles]', err);
    return { success: false, error: 'Failed to retrieve user roles' };
  }
}

export async function grantUserRole(params: {
  tenantId?: string;
  userId: string;
  role: string;
  branchId?: string | null;
}): Promise<ActionResult<void>> {
  try {
    const { session } = await getActionContext();

    const validation = grantRoleSchema.safeParse(params);
    if (!validation.success) {
      return { success: false, error: 'Validation failed' };
    }

    const result = await grantUserRoleDomain(
      {
        session: session as UserSession | null,
        tenantId: params.tenantId,
        userId: params.userId,
        role: params.role,
        branchId: params.branchId ?? null,
      },
      { logAuditEvent }
    );

    if ('error' in result) {
      return { success: false, error: String(result.error || 'Unknown error') };
    }
    return { success: true, data: undefined };
  } catch (err) {
    console.error('[Action:grantUserRole]', err);
    return { success: false, error: 'Failed to grant role' };
  }
}

export async function revokeUserRole(params: {
  tenantId?: string;
  userId: string;
  role: string;
  branchId?: string | null;
}): Promise<ActionResult<void>> {
  try {
    const { session } = await getActionContext();

    const validation = revokeRoleSchema.safeParse(params);
    if (!validation.success) {
      return { success: false, error: 'Validation failed' };
    }

    const result = await revokeUserRoleDomain(
      {
        session: session as UserSession | null,
        tenantId: params.tenantId,
        userId: params.userId,
        role: params.role,
        branchId: params.branchId ?? null,
      },
      { logAuditEvent }
    );

    if ('error' in result) {
      return { success: false, error: String(result.error || 'Unknown error') };
    }
    return { success: true, data: undefined };
  } catch (err) {
    console.error('[Action:revokeUserRole]', err);
    return { success: false, error: 'Failed to revoke role' };
  }
}
