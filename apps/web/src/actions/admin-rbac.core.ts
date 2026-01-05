'use server';

import { logAuditEvent } from '@/lib/audit';
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

export async function listBranches(params?: { tenantId?: string; includeInactive?: boolean }) {
  const { session } = await getActionContext();

  const validation = listBranchesSchema.safeParse(params || {});
  if (!validation.success) {
    return { error: 'Validation failed', details: validation.error.flatten() };
  }

  return listBranchesDomain({
    session: session as UserSession | null,
    tenantId: params?.tenantId,
    includeInactive: params?.includeInactive,
  });
}

export async function createBranch(params: {
  tenantId?: string;
  name: string;
  code?: string | null;
}) {
  const { session } = await getActionContext();

  const validation = createBranchSchema.safeParse(params);
  if (!validation.success) {
    return { error: 'Validation failed', details: validation.error.flatten() };
  }

  return createBranchDomain(
    {
      session: session as UserSession | null,
      tenantId: params.tenantId,
      name: params.name,
      code: params.code ?? null,
    },
    { logAuditEvent }
  );
}

export async function updateBranch(params: {
  tenantId?: string;
  branchId: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
}) {
  const { session } = await getActionContext();

  const validation = updateBranchSchema.safeParse(params);
  if (!validation.success) {
    return { error: 'Validation failed', details: validation.error.flatten() };
  }

  return updateBranchDomain(
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
}

export async function deleteBranch(params: { tenantId?: string; branchId: string }) {
  const { session } = await getActionContext();

  const validation = deleteBranchSchema.safeParse(params);
  if (!validation.success) {
    return { error: 'Validation failed', details: validation.error.flatten() };
  }

  return deleteBranchDomain(
    {
      session: session as UserSession | null,
      tenantId: params.tenantId,
      branchId: params.branchId,
    },
    { logAuditEvent }
  );
}

export async function listUserRoles(params?: { tenantId?: string; userId?: string }) {
  const { session } = await getActionContext();

  const validation = listUserRolesSchema.safeParse(params || {});
  if (!validation.success) {
    return { error: 'Validation failed', details: validation.error.flatten() };
  }

  return listUserRolesDomain({
    session: session as UserSession | null,
    tenantId: params?.tenantId,
    userId: params?.userId,
  });
}

export async function grantUserRole(params: {
  tenantId?: string;
  userId: string;
  role: string;
  branchId?: string | null;
}) {
  const { session } = await getActionContext();

  const validation = grantRoleSchema.safeParse(params);
  if (!validation.success) {
    return { error: 'Validation failed', details: validation.error.flatten() };
  }

  return grantUserRoleDomain(
    {
      session: session as UserSession | null,
      tenantId: params.tenantId,
      userId: params.userId,
      role: params.role,
      branchId: params.branchId ?? null,
    },
    { logAuditEvent }
  );
}

export async function revokeUserRole(params: {
  tenantId?: string;
  userId: string;
  role: string;
  branchId?: string | null;
}) {
  const { session } = await getActionContext();

  const validation = revokeRoleSchema.safeParse(params);
  if (!validation.success) {
    return { error: 'Validation failed', details: validation.error.flatten() };
  }

  return revokeUserRoleDomain(
    {
      session: session as UserSession | null,
      tenantId: params.tenantId,
      userId: params.userId,
      role: params.role,
      branchId: params.branchId ?? null,
    },
    { logAuditEvent }
  );
}
