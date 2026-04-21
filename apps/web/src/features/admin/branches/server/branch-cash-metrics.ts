import { db } from '@interdomestik/database/db';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema';
import { and, count, eq, inArray } from 'drizzle-orm';

export const BRANCH_CASH_OPEN_STATUSES = ['pending', 'needs_info'] as const;

interface BranchCashScope {
  tenantId: string;
  branchId: string;
}

function getTenantCashTruthFilter(tenantId: string) {
  return and(
    eq(leadPaymentAttempts.tenantId, tenantId),
    eq(memberLeads.tenantId, tenantId),
    eq(leadPaymentAttempts.method, 'cash'),
    inArray(leadPaymentAttempts.status, [...BRANCH_CASH_OPEN_STATUSES])
  );
}

function getBranchCashTruthFilter(scope: BranchCashScope) {
  return and(getTenantCashTruthFilter(scope.tenantId), eq(memberLeads.branchId, scope.branchId));
}

export async function getBranchCashPendingCount(scope: BranchCashScope): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(leadPaymentAttempts)
    .innerJoin(memberLeads, eq(leadPaymentAttempts.leadId, memberLeads.id))
    .where(getBranchCashTruthFilter(scope));

  return result?.count ?? 0;
}

export async function getBranchCashPendingByBranch(tenantId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      branchId: memberLeads.branchId,
      count: count(),
    })
    .from(leadPaymentAttempts)
    .innerJoin(memberLeads, eq(leadPaymentAttempts.leadId, memberLeads.id))
    .where(getTenantCashTruthFilter(tenantId))
    .groupBy(memberLeads.branchId);

  return new Map(rows.map(row => [row.branchId, row.count]));
}

export async function getBranchCashPendingByAgent(
  scope: BranchCashScope
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      agentId: memberLeads.agentId,
      count: count(),
    })
    .from(leadPaymentAttempts)
    .innerJoin(memberLeads, eq(leadPaymentAttempts.leadId, memberLeads.id))
    .where(getBranchCashTruthFilter(scope))
    .groupBy(memberLeads.agentId);

  return new Map(rows.map(row => [row.agentId, row.count]));
}
