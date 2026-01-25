import type { LeadStage } from '@interdomestik/database/constants';
import {
  agentCommissions,
  claims,
  crmDeals,
  crmLeads,
  memberLeads,
  subscriptions,
} from '@interdomestik/database/schema';
import { and, count, eq, inArray, isNotNull, lte, not, sql } from 'drizzle-orm';

export interface AgentDashboardServices {
  db: {
    select: any;
  };
}

/**
 * LITE: Logic for the standard Agent Dashboard (using MemberLeads/Claims).
 */
export async function getAgentDashboardLiteCore(
  params: { agentId: string },
  services: AgentDashboardServices
) {
  const { agentId } = params;
  const { db } = services;

  const [newLeads] = await db
    .select({ count: count() })
    .from(memberLeads)
    .where(and(eq(memberLeads.agentId, agentId), eq(memberLeads.status, 'new')));

  const [activeClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.agentId, agentId), not(inArray(claims.status, ['resolved', 'rejected']))));

  const [followUps] = await db
    .select({ count: count() })
    .from(memberLeads)
    .where(
      and(
        eq(memberLeads.agentId, agentId),
        isNotNull(memberLeads.nextStepAt),
        lte(memberLeads.nextStepAt, new Date())
      )
    );

  return {
    newLeadsCount: Number(newLeads?.count ?? 0),
    activeClaimsCount: Number(activeClaims?.count ?? 0),
    followUpsCount: Number(followUps?.count ?? 0),
  };
}

/**
 * V2: Logic for the Pro/V2 Agent Dashboard (using CRM schema).
 */
export async function getAgentDashboardV2StatsCore(
  params: { agentId: string },
  services: AgentDashboardServices
) {
  const { agentId } = params;
  const { db } = services;

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
    newLeads: Number(newLeads?.count ?? 0),
    contactedLeads: Number(contactedLeads?.count ?? 0),
    wonDeals: Number(wonDeals?.count ?? 0),
    totalPaidCommission: Number(totalCommission?.total ?? 0),
    clientCount: Number(clientCount?.count ?? 0),
  };
}
