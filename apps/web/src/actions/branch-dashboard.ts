'use server';

/**
 * Branch Dashboard Server Action
 * Public wrapper with session validation + Sentry instrumentation
 */

import * as Sentry from '@sentry/nextjs';

import { getBranchAgents, getBranchById, getBranchStats } from '@/actions/branch-dashboard.core';
import type { BranchDashboardDTO } from '@/actions/branch-dashboard.types';
import type { ActionResult } from '@/types/actions';
import { formatControlViolation } from '@interdomestik/domain-membership-billing';
import { ROLES, scopeFilter } from '@interdomestik/shared-auth';

import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { delegateSuperAdminBranchOwner } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';

export async function getBranchDashboard(
  branchId: string
): Promise<ActionResult<BranchDashboardDTO>> {
  // Context for Sentry (populated incrementally)
  const sentryContext: Record<string, string> = {
    feature: 'branch_dashboard',
    branchId,
  };

  try {
    const authorized = await authorizeSessionTenant();

    if (!authorized) {
      // Expected RBAC denial - do NOT send to Sentry
      return { success: false, error: 'Unauthorized' };
    }
    const { session, authority } = authorized;

    // Populate Sentry context
    sentryContext.userId = session.user.id;
    sentryContext.role = session.user.role ?? 'unknown';
    sentryContext.tenantId = session.user.tenantId ?? 'unknown';

    // Derive scope from session (NEVER from client input)
    const scope = scopeFilter(session);

    // Branch manager can only access their own branch
    const userRole = session.user.role;
    if (userRole === ROLES.branch_manager) {
      if (session.user.branchId !== branchId) {
        // Expected RBAC denial - do NOT send to Sentry
        return { success: false, error: 'Access denied to this branch' };
      }
    }

    // Agents and members cannot access branch dashboard
    if (userRole === ROLES.agent || userRole === 'user') {
      // Expected RBAC denial - do NOT send to Sentry
      return { success: false, error: 'Insufficient permissions' };
    }

    // For cross-tenant scope (super_admin), the branch's owning tenant is delegated from the super
    // admin's own session authority. Tenant-scoped users read under their session authority only.
    let readAuthority: TenantAuthority;
    if (scope.isCrossTenantScope) {
      const delegated = await delegateSuperAdminBranchOwner(authority, branchId);
      if (delegated?.branchId !== branchId) {
        return { success: false, error: 'Branch not found' };
      }
      readAuthority = delegated.authority;
    } else {
      if (!scope.tenantId || scope.tenantId !== readTenantAuthority(authority).tenantId) {
        return { success: false, error: 'Branch not found' };
      }
      readAuthority = authority;
    }

    // Fetch branch with tenant scoping
    const branch = await getBranchById(branchId, readAuthority);
    if (!branch) {
      return { success: false, error: 'Branch not found' };
    }

    const [stats, agents] = await Promise.all([
      getBranchStats(branchId, readAuthority, branch.isActive, branch.tenantId),
      getBranchAgents(branchId, readAuthority),
    ]);

    if (!stats.ok) {
      return {
        success: false,
        error: formatControlViolation(stats.violation),
      };
    }

    return {
      success: true,
      data: {
        branch,
        stats: stats.value,
        agents,
      },
    };
  } catch (err) {
    // Capture real exceptions with full context
    Sentry.captureException(err, {
      tags: sentryContext,
      extra: { action: 'getBranchDashboard' },
    });

    console.error('[Action:getBranchDashboard]', err);
    return { success: false, error: 'Failed to retrieve branch dashboard' };
  }
}
