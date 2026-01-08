'use server';

/**
 * Branch Dashboard Server Action
 * Public wrapper with session validation + Sentry instrumentation
 */

import * as Sentry from '@sentry/nextjs';

import { getBranchAgents, getBranchById, getBranchStats } from '@/actions/branch-dashboard.core';
import type { BranchDashboardDTO } from '@/actions/branch-dashboard.types';
import type { ActionResult } from '@/types/actions';
import { ROLES, scopeFilter } from '@interdomestik/shared-auth';

import { getActionContext } from './admin-users/context';

export async function getBranchDashboard(
  branchId: string
): Promise<ActionResult<BranchDashboardDTO>> {
  // Context for Sentry (populated incrementally)
  const sentryContext: Record<string, string> = {
    feature: 'branch_dashboard',
    branchId,
  };

  try {
    const { session } = await getActionContext();

    if (!session?.user) {
      // Expected RBAC denial - do NOT send to Sentry
      return { success: false, error: 'Unauthorized' };
    }

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

    // For cross-tenant scope (super_admin), derive tenantId from the branch
    // For tenant-scoped users, use their tenantId
    const tenantId = scope.isCrossTenantScope
      ? ((await resolveTenantFromBranch(branchId)) ?? '')
      : scope.tenantId;

    if (!tenantId) {
      return { success: false, error: 'Branch not found' };
    }

    // Fetch branch with tenant scoping
    const branch = await getBranchById(branchId, tenantId);
    if (!branch) {
      return { success: false, error: 'Branch not found' };
    }

    // Fetch stats and agents in parallel
    const [stats, agents] = await Promise.all([
      getBranchStats(branchId, tenantId),
      getBranchAgents(branchId, tenantId),
    ]);

    return {
      success: true,
      data: {
        branch,
        stats,
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

/**
 * Helper for super_admin: resolve tenantId from branchId
 */
async function resolveTenantFromBranch(branchId: string): Promise<string | null> {
  const { db } = await import('@interdomestik/database/db');
  const { branches } = await import('@interdomestik/database/schema');
  const { eq } = await import('drizzle-orm');

  const result = await db.query.branches.findFirst({
    where: eq(branches.id, branchId),
    columns: { tenantId: true },
  });

  return result?.tenantId ?? null;
}
