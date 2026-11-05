import type { db as defaultDb } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';
import { claimLifecycleStatusSql } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { and, count, desc, eq } from 'drizzle-orm';

import {
  adminClaimsBranchCondition,
  type ClaimsVisibilityContext,
} from '@/features/admin/claims/server/claimVisibility';

import type { AdminUserClaimCounts } from './_core';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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

type AdminUserClaimSummaryBase = {
  recentClaimsLimit: number;
  scope: AdminUserClaimSummaryScope;
  userId: string;
};

type AdminUserClaimSummaryArgs = AdminUserClaimSummaryBase &
  // The caller already runs inside its own tenant transaction.
  (
    | { db: DbClient; tenantId: string; authority?: undefined }
    // No executor: a tenant transaction is opened under the session's tenant authority.
    | { db?: undefined; authority: TenantAuthority; tenantId?: undefined }
  );

/** The summary inputs alone: the executor is never carried alongside them. */
function summaryInput(args: AdminUserClaimSummaryBase, tenantId: string) {
  return {
    recentClaimsLimit: args.recentClaimsLimit,
    scope: args.scope,
    tenantId,
    userId: args.userId,
  };
}

export async function getAdminUserClaimSummary(args: AdminUserClaimSummaryArgs) {
  if (args.db) {
    return summarizeAdminUserClaims(args.db, summaryInput(args, args.tenantId));
  }

  // No caller-supplied executor: the ambient client has no tenant context, so open one.
  const input = summaryInput(args, readTenantAuthority(args.authority).tenantId);
  return withTenantAuthority(args.authority, tx => summarizeAdminUserClaims(tx, input));
}

async function summarizeAdminUserClaims(
  db: DbClient,
  args: AdminUserClaimSummaryBase & { tenantId: string }
) {
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
