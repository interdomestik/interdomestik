import { claims } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { claimLifecycleStatusSql } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { eq, sql } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export type AdminAnalyticsStatusDistributionItem = {
  status: string | null;
  count: number;
};

export type AdminAnalyticsCategoryDistributionItem = {
  category: string | null;
  count: number;
};

export type AdminAnalyticsModel = {
  totals: {
    sum: number;
    avg: number;
    count: number;
  };
  statusDistribution: AdminAnalyticsStatusDistributionItem[];
  categoryDistribution: AdminAnalyticsCategoryDistributionItem[];
  activeClaimants: number;
  successRate: number;
};

export function computeSuccessRate(args: {
  totalsCount: number;
  statusDistribution: Array<{ status: string | null; count: number }>;
}): number {
  const resolvedCount = Number(
    args.statusDistribution.find(s => s.status === 'resolved')?.count ?? 0
  );

  return args.totalsCount > 0 ? (resolvedCount / args.totalsCount) * 100 : 0;
}

export function normalizeTotalsRow(row?: {
  sum?: number | null;
  avg?: number | null;
  count?: number | null;
}): { sum: number; avg: number; count: number } {
  return {
    sum: Number(row?.sum ?? 0),
    avg: Number(row?.avg ?? 0),
    count: Number(row?.count ?? 0),
  };
}

export async function getAdminAnalyticsDataCore(
  authority: TenantAuthority
): Promise<AdminAnalyticsModel> {
  const { tenantId } = readTenantAuthority(authority);

  const [totalsResult] = await withTenantAuthority(authority, tx =>
    tx
      .select({
        sum: sql<number>`COALESCE(SUM(CAST(${claims.claimAmount} AS NUMERIC)), 0)`,
        avg: sql<number>`COALESCE(AVG(CAST(${claims.claimAmount} AS NUMERIC)), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(claims)
      .where(eq(claims.tenantId, tenantId))
  );

  const totals = normalizeTotalsRow(totalsResult);
  const lifecycleStatus = claimLifecycleStatusSql();

  const statusDistributionRaw = await withTenantAuthority(authority, tx =>
    tx
      .select({
        status: lifecycleStatus,
        count: sql<number>`COUNT(*)`,
      })
      .from(claims)
      .where(eq(claims.tenantId, tenantId))
      .groupBy(lifecycleStatus)
  );

  const categoryDistributionRaw = await withTenantAuthority(authority, tx =>
    tx
      .select({
        category: claims.category,
        count: sql<number>`COUNT(*)`,
      })
      .from(claims)
      .where(eq(claims.tenantId, tenantId))
      .groupBy(claims.category)
  );

  const [activeClaimantsRow] = await withTenantAuthority(authority, tx =>
    tx
      .select({
        count: sql<number>`COUNT(DISTINCT ${claims.userId})`,
      })
      .from(claims)
      .where(eq(claims.tenantId, tenantId))
  );

  const statusDistribution: AdminAnalyticsStatusDistributionItem[] = (
    statusDistributionRaw ?? []
  ).map(item => ({
    status: item.status,
    count: Number(item.count ?? 0),
  }));

  const categoryDistribution: AdminAnalyticsCategoryDistributionItem[] = (
    categoryDistributionRaw ?? []
  ).map(item => ({
    category: item.category,
    count: Number(item.count ?? 0),
  }));

  const activeClaimants = Number(activeClaimantsRow?.count ?? 0);
  const successRate = computeSuccessRate({ totalsCount: totals.count, statusDistribution });

  return {
    totals,
    statusDistribution,
    categoryDistribution,
    activeClaimants,
    successRate,
  };
}
