'use server';

import { isBranchManager, isSuperAdmin, isTenantAdmin } from '@/lib/roles.core';
import { runAuthenticatedAction } from '@/lib/safe-action';
import {
  getBranchKPIs,
  getSuperAdminKPIs,
  getTenantAdminKPIs,
} from '@interdomestik/domain-analytics';

// 1. Super Admin Dashboard Action
export async function getSuperAdminKPIsAction() {
  return runAuthenticatedAction(async ({ userRole, authority }) => {
    if (!isSuperAdmin(userRole)) {
      throw new Error('Unauthorized: Super Admin access required');
    }
    return await getSuperAdminKPIs(authority);
  });
}

// 2. Tenant Admin Dashboard Action
export async function getTenantAdminKPIsAction() {
  return runAuthenticatedAction(async ({ userRole, authority }) => {
    // Tenant Admin / Staff Dashboard
    const hasAccess = isSuperAdmin(userRole) || isTenantAdmin(userRole) || userRole === 'staff';

    if (!hasAccess) {
      throw new Error('Unauthorized: Tenant Admin or Staff access required');
    }

    return await getTenantAdminKPIs(authority);
  });
}

// 3. Branch Dashboard Action
export async function getBranchKPIsAction(branchId: string) {
  return runAuthenticatedAction(async ({ userRole, authority, scope }) => {
    // Branch Manager can only see their own branch.
    // Tenant Admin/Staff can see any branch in their tenant.

    let allowed = false;

    if (isSuperAdmin(userRole) || isTenantAdmin(userRole) || userRole === 'staff') {
      allowed = true;
    } else if (isBranchManager(userRole)) {
      // Must match their assigned branch
      if (scope.branchId === branchId) {
        allowed = true;
      }
    }

    if (!allowed) {
      throw new Error('Unauthorized: You do not have access to this branch.');
    }

    return await getBranchKPIs(authority, branchId);
  });
}
