import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, count, eq, inArray } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export const BRANCH_CASH_OPEN_STATUSES = ['pending', 'needs_info'] as const;

interface BranchCashScope {
  authority: TenantAuthority;
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
  const { tenantId } = readTenantAuthority(scope.authority);
  return and(getTenantCashTruthFilter(tenantId), eq(memberLeads.branchId, scope.branchId));
}

export async function getBranchCashPendingCount(scope: BranchCashScope): Promise<number> {
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const [result] = await withTenantAuthority(scope.authority, tx =>
    tx
      .select({ count: count() })
      .from(leadPaymentAttempts)
      .innerJoin(memberLeads, eq(leadPaymentAttempts.leadId, memberLeads.id))
      .where(getBranchCashTruthFilter(scope))
  );

  return result?.count ?? 0;
}

export async function getBranchCashPendingByBranch(
  authority: TenantAuthority
): Promise<Map<string, number>> {
  const { tenantId } = readTenantAuthority(authority);
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const rows = await withTenantAuthority(authority, tx =>
    tx
      .select({
        branchId: memberLeads.branchId,
        count: count(),
      })
      .from(leadPaymentAttempts)
      .innerJoin(memberLeads, eq(leadPaymentAttempts.leadId, memberLeads.id))
      .where(getTenantCashTruthFilter(tenantId))
      .groupBy(memberLeads.branchId)
  );

  return new Map(rows.map(row => [row.branchId, row.count]));
}

export async function getBranchCashPendingByAgent(
  scope: BranchCashScope
): Promise<Map<string, number>> {
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const rows = await withTenantAuthority(scope.authority, tx =>
    tx
      .select({
        agentId: memberLeads.agentId,
        count: count(),
      })
      .from(leadPaymentAttempts)
      .innerJoin(memberLeads, eq(leadPaymentAttempts.leadId, memberLeads.id))
      .where(getBranchCashTruthFilter(scope))
      .groupBy(memberLeads.agentId)
  );

  return new Map(rows.map(row => [row.agentId, row.count]));
}
