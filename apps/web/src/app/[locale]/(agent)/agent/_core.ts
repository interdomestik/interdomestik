import type { LeadStage } from '@interdomestik/database/constants';
import { db } from '@interdomestik/database/db';
import {
  agentCommissions,
  crmDeals,
  crmLeads,
  subscriptions,
} from '@interdomestik/database/schema';
import { and, count, eq, sql } from 'drizzle-orm';

export type AgentDashboardStats = {
  newLeads: number;
  contactedLeads: number;
  wonDeals: number;
  totalPaidCommission: number;
  clientCount: number;
};

export async function getAgentDashboardStatsCore(args: {
  agentId: string;
}): Promise<AgentDashboardStats> {
  const { agentId } = args;

  const STAGE_NEW: LeadStage = 'new';
  const STAGE_CONTACTED: LeadStage = 'contacted';

  const [newLeads] = await db
    .select({ count: count() })
    .from(crmLeads)
    .where(and(eq(crmLeads.agentId, agentId), eq(crmLeads.stage, STAGE_NEW)));

  const [contactedLeads] = await db
    .select({ count: count() })
    .from(crmLeads)
    .where(and(eq(crmLeads.agentId, agentId), eq(crmLeads.stage, STAGE_CONTACTED)));

  const [wonDeals] = await db
    .select({ count: count() })
    .from(crmDeals)
    .where(and(eq(crmDeals.agentId, agentId), eq(crmDeals.stage, 'closed_won')));

  const [totalCommission] = await db
    .select({ total: sql<number>`COALESCE(sum(${agentCommissions.amount}), 0)` })
    .from(agentCommissions)
    .where(and(eq(agentCommissions.agentId, agentId), eq(agentCommissions.status, 'paid')));

  const [clientCount] = await db
    .select({ count: count() })
    .from(subscriptions)
    .where(eq(subscriptions.referredByAgentId, agentId));

  return {
    newLeads: newLeads?.count ?? 0,
    contactedLeads: contactedLeads?.count ?? 0,
    wonDeals: wonDeals?.count ?? 0,
    totalPaidCommission: Number(totalCommission?.total ?? 0),
    clientCount: clientCount?.count ?? 0,
  };
}
