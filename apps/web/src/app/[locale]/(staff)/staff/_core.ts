import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { claims } from '@interdomestik/database/schema';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';

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
  db: any;
}): Promise<StaffDashboardResult> {
  const { tenantId, role, db } = params;

  // 1. Role Gating
  const isStaffOrAdmin = ['staff', 'admin', 'tenant_admin', 'super_admin'].includes(role);
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

    // Queries
    const [totalRes] = await db.select({ val: count() }).from(claims).where(baseWhere);
    const [newRes] = await db
      .select({ val: count() })
      .from(claims)
      .where(and(baseWhere, eq(claims.status, newStatus)));

    const inProgressCondition =
      inProgressStatuses.length > 0 ? inArray(claims.status, inProgressStatuses) : sql`false`;

    const [inProgressRes] = await db
      .select({ val: count() })
      .from(claims)
      .where(and(baseWhere, inProgressCondition));

    const [completedRes] = await db
      .select({ val: count() })
      .from(claims)
      .where(and(baseWhere, inArray(claims.status, completedStatuses)));

    const recentClaimsRaw = await db.query.claims.findMany({
      where: baseWhere,
      orderBy: [desc(claims.updatedAt)],
      limit: 5,
      with: { user: true },
    });

    const recentClaims = recentClaimsRaw.map((c: Record<string, unknown>) => ({
      id: c.id as string,
      title: c.title as string,
      status: (c.status as string) || 'draft',
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
