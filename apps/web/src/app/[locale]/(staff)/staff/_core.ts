import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { claims } from '@interdomestik/database/schema';
import type * as DatabaseModule from '@interdomestik/database';
import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';
import {
  claimLifecycleStatusIn,
  claimLifecycleStatusIs,
} from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { ROLES } from '@interdomestik/shared-auth';
import { and, count, desc, eq, sql } from 'drizzle-orm';

type DatabaseClient = typeof DatabaseModule.db;

export interface StaffDashboardDTO {
  stats: {
    total: number;
    new: number;
    inProgress: number;
    completed: number;
  };
  recentClaims: {
    id: string;
    title: string;
    status: string;
    companyName: string;
    createdAt: string;
    user: {
      name: string | null;
    } | null;
  }[];
}

export type StaffDashboardResult =
  | { ok: true; data: StaffDashboardDTO }
  | { ok: false; code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INTERNAL' };

/**
 * Pure helper for the staff dashboard where clause.
 * Ensures multi-tenant isolation.
 */
export function buildStaffDashboardWhere(params: { tenantId: string }) {
  return eq(claims.tenantId, params.tenantId);
}

export async function getStaffDashboardCore(params: {
  tenantId: string;
  userId: string;
  role: string;
  db: DatabaseClient;
}): Promise<StaffDashboardResult> {
  const { tenantId, role, db } = params;

  // 1. Role Gating
  const staffOrAdminRoles = [
    ROLES.staff,
    ROLES.admin,
    ROLES.tenant_admin,
    ROLES.super_admin,
  ] as readonly string[];
  const isStaffOrAdmin = staffOrAdminRoles.includes(role);
  if (!isStaffOrAdmin) {
    return { ok: false, code: 'FORBIDDEN' };
  }

  try {
    const completedStatuses: readonly ClaimStatus[] = ['resolved', 'rejected'];
    const newStatus: ClaimStatus = 'submitted';
    const inProgressStatuses = CLAIM_STATUSES.filter(
      status => status !== 'draft' && status !== newStatus && !completedStatuses.includes(status)
    );

    const baseWhere = buildStaffDashboardWhere({ tenantId });
    const inProgressCondition =
      inProgressStatuses.length > 0 ? claimLifecycleStatusIn(inProgressStatuses) : sql`false`;

    // Vercel Best Practice: Eliminate Waterfall (async-parallel)
    // Execute all independent DB queries in parallel
    const [[totalRes], [newRes], [inProgressRes], [completedRes], recentClaimsRaw] =
      await Promise.all([
        // db-access-guard: tenant-scoped -- reason: tenantId resolved into local variable before this DB call
        db.select({ val: count() }).from(claims).where(baseWhere),
        // db-access-guard: tenant-scoped -- reason: tenantId resolved into local variable before this DB call
        db
          .select({ val: count() })
          .from(claims)
          .where(and(baseWhere, claimLifecycleStatusIs(newStatus))),
        // db-access-guard: tenant-scoped -- reason: tenant predicate built by local helper and consumed by this DB call
        db.select({ val: count() }).from(claims).where(and(baseWhere, inProgressCondition)),
        // db-access-guard: tenant-scoped -- reason: tenant predicate built by local helper and consumed by this DB call
        db
          .select({ val: count() })
          .from(claims)
          .where(and(baseWhere, claimLifecycleStatusIn(completedStatuses))),
        // db-access-guard: tenant-scoped -- reason: tenant predicate built by local helper and consumed by this DB call
        db.query.claims.findMany({
          where: baseWhere,
          orderBy: [desc(claims.updatedAt)],
          limit: 5,
          with: { user: true },
        }),
      ]);

    const recentClaims = recentClaimsRaw.map((c: Record<string, unknown>) => ({
      id: c.id as string,
      title: c.title as string,
      status: resolveClaimLifecycleReadProjection({
        status: c.status as string | null,
        caseLifecycleState: c.caseLifecycleState as string | null,
        recoveryLifecycleState: c.recoveryLifecycleState as string | null,
      }).status,
      companyName: (c.companyName as string) || 'Unknown',
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      user: c.user ? { name: (c.user as Record<string, unknown>).name as string | null } : null,
    }));

    return {
      ok: true,
      data: {
        stats: {
          total: Number(totalRes?.val || 0),
          new: Number(newRes?.val || 0),
          inProgress: Number(inProgressRes?.val || 0),
          completed: Number(completedRes?.val || 0),
        },
        recentClaims,
      },
    };
  } catch (error) {
    console.error('[StaffDashboardCore] Error assembling dashboard:', error);
    return { ok: false, code: 'INTERNAL' };
  }
}
