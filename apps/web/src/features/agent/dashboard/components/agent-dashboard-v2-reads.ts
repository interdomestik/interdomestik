import { getAgentDashboardV2StatsCore } from '@/app/[locale]/(agent)/agent/_core';
import { withTenantContext } from '@interdomestik/database';

export function readAgentDashboardV2Stats(args: { agentId: string; tenantId: string }) {
  const { agentId, tenantId } = args;
  return withTenantContext({ tenantId }, tx =>
    getAgentDashboardV2StatsCore({ agentId, tenantId }, { db: tx })
  );
}

export function readAgentDashboardBranch(args: { branchId: string; tenantId: string }) {
  const { branchId, tenantId } = args;
  return withTenantContext({ tenantId }, tx =>
    tx.query.branches.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.id, branchId), eq(fields.tenantId, tenantId)),
      columns: { name: true },
    })
  );
}
