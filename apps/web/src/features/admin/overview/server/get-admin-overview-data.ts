import 'server-only';

import { ACTIONABLE_CLAIM_STATUSES } from '@interdomestik/domain-claims';
import { db } from '@interdomestik/database/db';
import { branches, claims, user } from '@interdomestik/database/schema';
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';

export type AdminOverviewReadModel = {
  kpis: {
    totalMembers: number;
    totalAgents: number;
    totalActiveClaims: number;
    claimsUpdatedLast24h: number;
  };
  claimsByStage: Array<{
    stage: string;
    count: number;
  }>;
  claimsByBranch: Array<{
    branchId: string | null;
    branchName: string;
    count: number;
  }>;
};

export async function getAdminOverviewData(params: {
  tenantId: string;
  locale: string;
}): Promise<AdminOverviewReadModel> {
  const { tenantId, locale } = params;
  void locale;
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    membersRes,
    agentsRes,
    activeClaimsRes,
    updated24hRes,
    claimsByStageRes,
    claimsByBranchRes,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.role, 'member'))),
    db
      .select({ value: count() })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.role, 'agent'))),
    db
      .select({ value: count() })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), inArray(claims.status, ACTIONABLE_CLAIM_STATUSES))),
    db
      .select({ value: count() })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, tenantId),
          inArray(claims.status, ACTIONABLE_CLAIM_STATUSES),
          gte(claims.updatedAt, last24h)
        )
      ),
    db
      .select({
        stage: claims.status,
        count: count(),
      })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), inArray(claims.status, ACTIONABLE_CLAIM_STATUSES)))
      .groupBy(claims.status)
      .orderBy(desc(count())),
    db
      .select({
        branchId: claims.branchId,
        branchName: branches.name,
        count: count(),
      })
      .from(claims)
      .leftJoin(branches, and(eq(branches.id, claims.branchId), eq(branches.tenantId, tenantId)))
      .where(and(eq(claims.tenantId, tenantId), inArray(claims.status, ACTIONABLE_CLAIM_STATUSES)))
      .groupBy(claims.branchId, branches.name)
      .orderBy(desc(count())),
  ]);

  return {
    kpis: {
      totalMembers: Number(membersRes[0]?.value ?? 0),
      totalAgents: Number(agentsRes[0]?.value ?? 0),
      totalActiveClaims: Number(activeClaimsRes[0]?.value ?? 0),
      claimsUpdatedLast24h: Number(updated24hRes[0]?.value ?? 0),
    },
    claimsByStage: claimsByStageRes.map(row => ({
      stage: row.stage ?? 'unknown',
      count: Number(row.count ?? 0),
    })),
    claimsByBranch: claimsByBranchRes.map(row => ({
      branchId: row.branchId ?? null,
      branchName: row.branchName ?? 'Unassigned',
      count: Number(row.count ?? 0),
    })),
  };
}
