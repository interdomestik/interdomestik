import type { TenantTransaction } from '@interdomestik/database';
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

/**
 * Reads the member claim summary through the caller's tenant-context transaction.
 * Must be called inside an already-admitted profile read closure; it performs no admission itself.
 */
export async function getAgentClientClaimSummary(
  tx: TenantTransaction,
  memberId: string,
  tenantId: string
) {
  const lifecycleStatus = claimLifecycleStatusSql();
  const [claimCounts, recentClaimsRaw] = await Promise.all([
    tx
      .select({ status: lifecycleStatus, total: count() })
      .from(claims)
      .where(and(eq(claims.userId, memberId), eq(claims.tenantId, tenantId)))
      .groupBy(lifecycleStatus),
    tx
      .select({
        id: claims.id,
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
