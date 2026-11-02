import { listSuperAdminAggregateWork } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { branches, claims, user } from '@interdomestik/database/schema';
import { count, eq, sql } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export interface SuperAdminKPIs {
  totalTenants: number;
  totalBranches: number;
  totalStaff: number;
  totalAgents: number;
  totalMembers: number;
  claimsMetrics: {
    total: number;
    today: number;
    last7d: number;
    last30d: number;
  };
}

/** The actor is the caller's own session authority; its principal role is the one checked. */
export type PlatformAnalyticsActor = TenantAuthority;

/** Platform analytics are super_admin only; any other actor fails closed before a tenant is read. */
export function assertPlatformAnalyticsActor(actor: PlatformAnalyticsActor): void {
  if (readTenantAuthority(actor).principal?.role !== 'super_admin') {
    throw new Error('Unauthorized: Super Admin access required');
  }
}

/**
 * Platform totals for a super_admin. Each tenant's figures are read under that tenant's RLS
 * context and summed; only totals are returned.
 */
export async function getSuperAdminKPIs(actor: PlatformAnalyticsActor): Promise<SuperAdminKPIs> {
  assertPlatformAnalyticsActor(actor);
  const work = await listSuperAdminAggregateWork(actor);
  const kpis: SuperAdminKPIs = {
    totalTenants: work.length,
    totalBranches: 0,
    totalStaff: 0,
    totalAgents: 0,
    totalMembers: 0,
    claimsMetrics: { total: 0, today: 0, last7d: 0, last30d: 0 },
  };

  for (const { tenantId, authority } of work) {
    const tenant = await withTenantAuthority(authority, async tx => {
      const [branchRow] = await tx
        .select({ count: count() })
        .from(branches)
        .where(eq(branches.tenantId, tenantId));
      const [userRow] = await tx
        .select({
          staff: sql<number>`COUNT(*) FILTER (WHERE ${user.role} = 'staff')`,
          agents: sql<number>`COUNT(*) FILTER (WHERE ${user.role} = 'agent')`,
          members: sql<number>`COUNT(*) FILTER (WHERE ${user.role} = 'member')`,
        })
        .from(user)
        .where(eq(user.tenantId, tenantId));
      const [claimRow] = await tx
        .select({
          total: count(),
          today: sql<number>`COUNT(*) FILTER (WHERE ${claims.createdAt} >= NOW() - INTERVAL '1 day')`,
          last7d: sql<number>`COUNT(*) FILTER (WHERE ${claims.createdAt} >= NOW() - INTERVAL '7 days')`,
          last30d: sql<number>`COUNT(*) FILTER (WHERE ${claims.createdAt} >= NOW() - INTERVAL '30 days')`,
        })
        .from(claims)
        .where(eq(claims.tenantId, tenantId));
      return { branchRow, userRow, claimRow };
    });

    kpis.totalBranches += Number(tenant.branchRow?.count ?? 0);
    kpis.totalStaff += Number(tenant.userRow?.staff ?? 0);
    kpis.totalAgents += Number(tenant.userRow?.agents ?? 0);
    kpis.totalMembers += Number(tenant.userRow?.members ?? 0);
    kpis.claimsMetrics.total += Number(tenant.claimRow?.total ?? 0);
    kpis.claimsMetrics.today += Number(tenant.claimRow?.today ?? 0);
    kpis.claimsMetrics.last7d += Number(tenant.claimRow?.last7d ?? 0);
    kpis.claimsMetrics.last30d += Number(tenant.claimRow?.last30d ?? 0);
  }

  return kpis;
}
