import { withTenantContext } from '@interdomestik/database';
import type { db as defaultDb } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';
import { claimLifecycleStatusSql } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { and, count, desc, eq } from 'drizzle-orm';

import {
  adminClaimsBranchCondition,
  type ClaimsVisibilityContext,
} from '@/features/admin/claims/server/claimVisibility';

import type { AdminUserClaimCounts } from './_core';

type DbClient = Pick<typeof defaultDb, 'select'>;

/** Granted actor scope; a branch manager previews only own-branch claims of the member. */
export type AdminUserClaimSummaryScope = Pick<ClaimsVisibilityContext, 'role' | 'branchId'>;

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

type AdminUserClaimSummaryArgs = {
  db?: DbClient;
  recentClaimsLimit: number;
  scope: AdminUserClaimSummaryScope;
  tenantId: string;
  userId: string;
};

export async function getAdminUserClaimSummary(args: AdminUserClaimSummaryArgs) {
  const { db: executor } = args;
  if (executor) return summarizeAdminUserClaims(executor, args);

  // No caller-supplied executor: the ambient client has no tenant context, so open one.
  return withTenantContext({ tenantId: args.tenantId, role: args.scope.role }, tx =>
    summarizeAdminUserClaims(tx, args)
  );
}

async function summarizeAdminUserClaims(db: DbClient, args: AdminUserClaimSummaryArgs) {
  const where = and(
    eq(claims.userId, args.userId),
    eq(claims.tenantId, args.tenantId),
    adminClaimsBranchCondition(args.scope)
  );
  const [claimCounts, recentClaims] = await Promise.all([
    // db-access-guard: tenant-scoped -- reason: shared where limits tenant/member/branch; mounted core supplies its tenant transaction
    db
      .select({ status: claimLifecycleStatusSql(), total: count() })
      .from(claims)
      .where(where)
      .groupBy(claimLifecycleStatusSql()),
    // db-access-guard: tenant-scoped -- reason: shared where limits tenant/member/branch; mounted core supplies its tenant transaction
    db
      .select({
        id: claims.id,
        title: claims.title,
        caseLifecycleState: claims.caseLifecycleState,
        recoveryLifecycleState: claims.recoveryLifecycleState,
        claimAmount: claims.claimAmount,
        currency: claims.currency,
        createdAt: claims.createdAt,
      })
      .from(claims)
      .where(where)
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
