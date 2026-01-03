'use server';

import {
  createBranchCore as createBranchDomain,
  grantUserRoleCore as grantUserRoleDomain,
  listBranchesCore as listBranchesDomain,
  listUserRolesCore as listUserRolesDomain,
  revokeUserRoleCore as revokeUserRoleDomain,
} from '@interdomestik/domain-users/admin/rbac';
import type { UserSession } from '@interdomestik/domain-users/types';

import { getActionContext } from './admin-users/context';

export async function listBranches(params?: { tenantId?: string }) {
  const { session } = await getActionContext();
  return listBranchesDomain({
    session: session as UserSession | null,
    tenantId: params?.tenantId,
  });
}

export async function createBranch(params: {
  tenantId?: string;
  name: string;
  code?: string | null;
}) {
  const { session } = await getActionContext();
  return createBranchDomain({
    session: session as UserSession | null,
    tenantId: params.tenantId,
    name: params.name,
    code: params.code ?? null,
  });
}

export async function listUserRoles(params?: { tenantId?: string; userId?: string }) {
  const { session } = await getActionContext();
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
  return grantUserRoleDomain({
    session: session as UserSession | null,
    tenantId: params.tenantId,
    userId: params.userId,
    role: params.role,
    branchId: params.branchId ?? null,
  });
}

export async function revokeUserRole(params: {
  tenantId?: string;
  userId: string;
  role: string;
  branchId?: string | null;
}) {
  const { session } = await getActionContext();
  return revokeUserRoleDomain({
    session: session as UserSession | null,
    tenantId: params.tenantId,
    userId: params.userId,
    role: params.role,
    branchId: params.branchId ?? null,
  });
}
