import { type LeadStage } from '@interdomestik/database/constants';
import { db } from '@interdomestik/database/db';
import { agentCommissions, crmDeals, crmLeads } from '@interdomestik/database/schema';
import { and, count, eq, inArray, sql } from 'drizzle-orm';

export type AgentCrmStats = {
  newLeadsCount: number;
  contactedLeadsCount: number;
  closedWonDealsCount: number;
  paidCommissionTotal: number;
};

export async function getAgentCrmStatsCore(args: {
  agentId: string;
  tenantId: string;
}): Promise<AgentCrmStats> {
  const { agentId, tenantId } = args;

  const [leadCounts, [wonDeals], [totalCommission]] = await Promise.all([
    db
      .select({ stage: crmLeads.stage, count: count() })
      .from(crmLeads)
      .where(
        and(
          eq(crmLeads.tenantId, tenantId),
          eq(crmLeads.agentId, agentId),
          inArray(crmLeads.stage, ['new', 'contacted'] as LeadStage[])
        )
      )
      .groupBy(crmLeads.stage),
    db
      .select({ count: count() })
      .from(crmDeals)
      .where(
        and(
          eq(crmDeals.tenantId, tenantId),
          eq(crmDeals.agentId, agentId),
          eq(crmDeals.stage, 'closed_won')
        )
      ),
    db
      .select({ total: sql<number>`sum(${agentCommissions.amount})` })
      .from(agentCommissions)
      .where(
        and(
          eq(agentCommissions.tenantId, tenantId),
          eq(agentCommissions.agentId, agentId),
          eq(agentCommissions.status, 'paid')
        )
      ),
  ]);

  return {
    newLeadsCount: Number(leadCounts.find(r => r.stage === 'new')?.count ?? 0),
    contactedLeadsCount: Number(leadCounts.find(r => r.stage === 'contacted')?.count ?? 0),
    closedWonDealsCount: Number(wonDeals?.count ?? 0),
    paidCommissionTotal: Number(totalCommission?.total ?? 0),
  };
}
