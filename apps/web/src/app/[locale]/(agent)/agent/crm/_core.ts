import {
  CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE,
  isCrmLeadFollowUpDue,
} from '@interdomestik/domain-crm/leads/follow-up';
import type { CrmLeadActivity } from '@interdomestik/domain-crm/leads/types';
import { type LeadStage } from '@interdomestik/database/constants';
import { db } from '@interdomestik/database/db';
import {
  agentCommissions,
  crmActivities,
  crmDeals,
  crmLeads,
} from '@interdomestik/database/schema';
import { and, asc, count, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

const MAX_DUE_FOLLOW_UPS = 5;

export type AgentCrmStats = {
  newLeadsCount: number;
  contactedLeadsCount: number;
  closedWonDealsCount: number;
  paidCommissionTotal: number;
  dueFollowUps: AgentCrmDueFollowUp[];
};

export type AgentCrmDueFollowUp = {
  activityId: string;
  leadId: string;
  leadName: string | null;
  scheduledAt: string;
  subject: string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export async function getAgentCrmStatsCore(args: {
  agentId: string;
  tenantId: string;
}): Promise<AgentCrmStats> {
  const { agentId, tenantId } = args;

  const now = new Date().toISOString();

  const [leadCounts, [wonDeals], [totalCommission], dueFollowUpRows] = await Promise.all([
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
    db
      .select({
        activityId: crmActivities.id,
        leadId: crmActivities.leadId,
        fullName: crmLeads.fullName,
        companyName: crmLeads.companyName,
        scheduledAt: crmActivities.scheduledAt,
        subject: crmActivities.summary,
        tenantId: crmActivities.tenantId,
        agentId: crmActivities.agentId,
        completedAt: crmActivities.completedAt,
        createdAt: crmActivities.createdAt,
        type: crmActivities.type,
      })
      .from(crmActivities)
      .innerJoin(crmLeads, eq(crmLeads.id, crmActivities.leadId))
      .where(
        and(
          eq(crmActivities.tenantId, tenantId),
          eq(crmActivities.agentId, agentId),
          eq(crmLeads.tenantId, tenantId),
          eq(crmActivities.type, CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE),
          isNull(crmActivities.completedAt),
          lte(crmActivities.scheduledAt, new Date(now))
        )
      )
      .orderBy(asc(crmActivities.scheduledAt))
      .limit(MAX_DUE_FOLLOW_UPS),
  ]);

  return {
    newLeadsCount: Number(leadCounts.find(r => r.stage === 'new')?.count ?? 0),
    contactedLeadsCount: Number(leadCounts.find(r => r.stage === 'contacted')?.count ?? 0),
    closedWonDealsCount: Number(wonDeals?.count ?? 0),
    paidCommissionTotal: Number(totalCommission?.total ?? 0),
    dueFollowUps: dueFollowUpRows
      .filter(row => {
        const activity: CrmLeadActivity = {
          agentId: row.agentId,
          completedAt: toIso(row.completedAt),
          createdAt: toIso(row.createdAt) ?? now,
          description: null,
          id: row.activityId,
          leadId: row.leadId,
          occurredAt: toIso(row.createdAt) ?? now,
          scheduledAt: toIso(row.scheduledAt),
          subject: row.subject,
          tenantId: row.tenantId,
          type: row.type,
        };
        return isCrmLeadFollowUpDue(activity, now);
      })
      .map(row => ({
        activityId: row.activityId,
        leadId: row.leadId,
        leadName: row.fullName || row.companyName || null,
        scheduledAt: toIso(row.scheduledAt) ?? now,
        subject: row.subject,
      })),
  };
}
