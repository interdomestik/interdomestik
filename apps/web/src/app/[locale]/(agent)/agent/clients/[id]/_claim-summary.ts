import { db } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';
import { claimLifecycleStatusSql } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { and, count, desc, eq } from 'drizzle-orm';

const RECENT_CLAIMS_LIMIT = 6;

export type AgentClientClaimCounts = {
  total: number;
  open: number;
  resolved: number;
  rejected: number;
};

export async function getAgentClientClaimSummary(memberId: string, tenantId: string) {
  const lifecycleStatus = claimLifecycleStatusSql();
  const [claimCounts, recentClaimsRaw] = await Promise.all([
    db
      .select({ status: lifecycleStatus, total: count() })
      .from(claims)
      .where(and(eq(claims.userId, memberId), eq(claims.tenantId, tenantId)))
      .groupBy(lifecycleStatus),
    db
      .select({
        id: claims.id,
        status: claims.status,
        caseLifecycleState: claims.caseLifecycleState,
        recoveryLifecycleState: claims.recoveryLifecycleState,
      })
      .from(claims)
      .where(and(eq(claims.userId, memberId), eq(claims.tenantId, tenantId)))
      .orderBy(desc(claims.createdAt))
      .limit(RECENT_CLAIMS_LIMIT),
  ]);

  const counts: AgentClientClaimCounts = { total: 0, open: 0, resolved: 0, rejected: 0 };
  for (const row of claimCounts) {
    const total = Number(row.total || 0);
    counts.total += total;
    if (row.status === 'resolved') counts.resolved += total;
    else if (row.status === 'rejected') counts.rejected += total;
    else counts.open += total;
  }

  return {
    claimCounts: counts,
    recentClaims: recentClaimsRaw.map(claim => ({
      id: claim.id,
      status: resolveClaimLifecycleReadProjection(claim).status,
    })),
  };
}
