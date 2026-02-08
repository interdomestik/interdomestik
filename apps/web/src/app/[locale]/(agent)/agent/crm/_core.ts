import { type LeadStage } from '@interdomestik/database/constants';
import { db } from '@interdomestik/database/db';
import { agentCommissions, crmDeals, crmLeads } from '@interdomestik/database/schema';
import { and, count, eq, sql } from 'drizzle-orm';

export type AgentCrmStats = {
  newLeadsCount: number;
  contactedLeadsCount: number;
  closedWonDealsCount: number;
  paidCommissionTotal: number;
};

export async function getAgentCrmStatsCore(args: { agentId: string }): Promise<AgentCrmStats> {
  const { agentId } = args;

  const STAGE_NEW: LeadStage = 'new';
  const STAGE_CONTACTED: LeadStage = 'contacted';

  const [[newLeads], [contactedLeads], [wonDeals], [totalCommission]] = await Promise.all([
    db
      .select({ count: count() })
      .from(crmLeads)
      .where(and(eq(crmLeads.agentId, agentId), eq(crmLeads.stage, STAGE_NEW))),
    db
      .select({ count: count() })
      .from(crmLeads)
      .where(and(eq(crmLeads.agentId, agentId), eq(crmLeads.stage, STAGE_CONTACTED))),
    db
      .select({ count: count() })
      .from(crmDeals)
      .where(and(eq(crmDeals.agentId, agentId), eq(crmDeals.stage, 'closed_won'))),
    db
      .select({ total: sql<number>`sum(${agentCommissions.amount})` })
      .from(agentCommissions)
      .where(and(eq(agentCommissions.agentId, agentId), eq(agentCommissions.status, 'paid'))),
  ]);

  return {
    newLeadsCount: Number(newLeads?.count ?? 0),
    contactedLeadsCount: Number(contactedLeads?.count ?? 0),
    closedWonDealsCount: Number(wonDeals?.count ?? 0),
    paidCommissionTotal: Number(totalCommission?.total ?? 0),
  };
}
