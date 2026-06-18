import { db } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';
import { claimLifecycleStatusSql } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { and, count, desc, eq } from 'drizzle-orm';

import type { AdminUserClaimCounts } from './_core';

function computeClaimCounts(rows: Array<{ status: string | null; total: unknown }>) {
  const counts: AdminUserClaimCounts = { total: 0, open: 0, resolved: 0, rejected: 0 };
  for (const row of rows) {
    const total = Number(row.total || 0);
    counts.total += total;
    if (row.status === 'resolved') counts.resolved += total;
    else if (row.status === 'rejected') counts.rejected += total;
    else counts.open += total;
  }
  return counts;
}

export async function getAdminUserClaimSummary(args: {
  recentClaimsLimit: number;
  tenantId: string;
  userId: string;
}) {
  const [claimCounts, recentClaims] = await Promise.all([
    db
      .select({ status: claimLifecycleStatusSql(), total: count() })
      .from(claims)
      .where(and(eq(claims.userId, args.userId), eq(claims.tenantId, args.tenantId)))
      .groupBy(claimLifecycleStatusSql()),
    db
      .select({
        id: claims.id,
        title: claims.title,
        status: claims.status,
        caseLifecycleState: claims.caseLifecycleState,
        recoveryLifecycleState: claims.recoveryLifecycleState,
        claimAmount: claims.claimAmount,
        currency: claims.currency,
        createdAt: claims.createdAt,
      })
      .from(claims)
      .where(and(eq(claims.userId, args.userId), eq(claims.tenantId, args.tenantId)))
      .orderBy(desc(claims.createdAt))
      .limit(args.recentClaimsLimit),
  ]);

  return {
    counts: computeClaimCounts(claimCounts),
    recentClaims: recentClaims.map(claim => ({
      ...claim,
      status: resolveClaimLifecycleReadProjection(claim).status,
    })),
  };
}
