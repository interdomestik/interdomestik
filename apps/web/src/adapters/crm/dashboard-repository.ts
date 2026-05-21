import type {
  AgentCrmDashboardReadModel,
  AgentCrmDashboardRepository,
} from '@interdomestik/domain-crm/dashboards';
import { CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE } from '@interdomestik/domain-crm/dashboards';
import { db } from '@interdomestik/database/db';
import {
  agentCommissions,
  crmActivities,
  crmDeals,
  crmLeads,
  crmTasks,
} from '@interdomestik/database/schema';
import { and, asc, count, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

import type { LeadStage } from '@interdomestik/database/constants';

export const crmDashboardRepository: AgentCrmDashboardRepository = {
  async readAgentDashboard(params): Promise<AgentCrmDashboardReadModel> {
    const { actor, limit, now } = params;
    const branchId = actor.scope.branchId;
    if (!branchId) {
      throw new Error('CRM dashboard read requires actor branch scope');
    }

    const [leadCounts, [wonDeals], [totalCommission], legacyDueFollowUpRows, taskDueFollowUpRows] =
      await Promise.all([
        // db-access-guard: tenant-scoped -- reason: domain CRM dashboard adapter constrains lead counts by actor tenant, agent, and branch scope
        db
          .select({ stage: crmLeads.stage, count: count() })
          .from(crmLeads)
          .where(
            and(
              eq(crmLeads.tenantId, actor.tenantId),
              eq(crmLeads.agentId, actor.actorId),
              eq(crmLeads.branchId, branchId),
              inArray(crmLeads.stage, ['new', 'contacted'] as LeadStage[])
            )
          )
          .groupBy(crmLeads.stage),
        // db-access-guard: tenant-scoped -- reason: domain CRM dashboard adapter constrains won deals by actor tenant, agent, and durable lead branch scope
        db
          .select({ count: count() })
          .from(crmDeals)
          .innerJoin(
            crmLeads,
            and(
              eq(crmLeads.tenantId, actor.tenantId),
              eq(crmLeads.id, crmDeals.leadId),
              eq(crmLeads.agentId, actor.actorId),
              eq(crmLeads.branchId, branchId)
            )
          )
          .where(
            and(
              eq(crmDeals.tenantId, actor.tenantId),
              eq(crmDeals.agentId, actor.actorId),
              eq(crmDeals.stage, 'closed_won')
            )
          ),
        // db-access-guard: tenant-scoped -- reason: domain CRM dashboard adapter constrains commission aggregate by actor tenant and agent scope; commissions do not carry branch_id
        db
          .select({ total: sql<number>`sum(${agentCommissions.amount})` })
          .from(agentCommissions)
          .where(
            and(
              eq(agentCommissions.tenantId, actor.tenantId),
              eq(agentCommissions.agentId, actor.actorId),
              eq(agentCommissions.status, 'paid')
            )
          ),
        // db-access-guard: tenant-scoped -- reason: domain CRM dashboard adapter constrains due follow-up reads by actor tenant, agent, activity branch, and lead branch scope
        db
          .select({
            activityId: crmActivities.id,
            agentId: crmActivities.agentId,
            branchId: crmActivities.branchId,
            completedAt: crmActivities.completedAt,
            companyName: crmLeads.companyName,
            createdAt: crmActivities.createdAt,
            fullName: crmLeads.fullName,
            leadId: crmActivities.leadId,
            scheduledAt: crmActivities.scheduledAt,
            subject: crmActivities.summary,
            tenantId: crmActivities.tenantId,
            type: crmActivities.type,
          })
          .from(crmActivities)
          .innerJoin(
            crmLeads,
            and(
              eq(crmLeads.id, crmActivities.leadId),
              eq(crmLeads.tenantId, actor.tenantId),
              eq(crmLeads.agentId, actor.actorId),
              eq(crmLeads.branchId, branchId)
            )
          )
          .where(
            and(
              eq(crmActivities.tenantId, actor.tenantId),
              eq(crmActivities.agentId, actor.actorId),
              eq(crmActivities.branchId, branchId),
              eq(crmActivities.type, CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE),
              isNull(crmActivities.completedAt),
              lte(crmActivities.scheduledAt, new Date(now))
            )
          )
          .orderBy(asc(crmActivities.scheduledAt), asc(crmActivities.id))
          .limit(limit),
        // db-access-guard: tenant-scoped -- reason: task-backed follow-up reads constrain by actor tenant, assignment, branch, lead visibility, and due status
        db
          .select({
            activityId: crmTasks.id,
            agentId: crmTasks.assignedActorId,
            branchId: crmTasks.branchId,
            companyName: crmLeads.companyName,
            createdAt: crmTasks.createdAt,
            expectedLifecycleVersion: crmTasks.lifecycleVersion,
            fullName: crmLeads.fullName,
            leadId: crmTasks.subjectId,
            scheduledAt: crmTasks.dueAt,
            tenantId: crmTasks.tenantId,
          })
          .from(crmTasks)
          .innerJoin(
            crmLeads,
            and(
              eq(crmLeads.id, crmTasks.subjectId),
              eq(crmLeads.tenantId, actor.tenantId),
              eq(crmLeads.agentId, actor.actorId),
              eq(crmLeads.branchId, branchId)
            )
          )
          .where(
            and(
              eq(crmTasks.tenantId, actor.tenantId),
              eq(crmTasks.branchId, branchId),
              eq(crmTasks.subjectKind, 'lead'),
              eq(crmTasks.createReasonCode, CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE),
              eq(crmTasks.assignedKind, 'actor'),
              eq(crmTasks.assignedActorId, actor.actorId),
              inArray(crmTasks.status, ['pending', 'in_progress']),
              lte(crmTasks.dueAt, new Date(now))
            )
          )
          .orderBy(asc(crmTasks.dueAt), asc(crmTasks.id))
          .limit(limit),
      ]);

    return {
      closedWonDealsCount: wonDeals?.count ?? 0,
      dueFollowUps: [
        ...legacyDueFollowUpRows.map(row => ({
          ...row,
          expectedLifecycleVersion: null,
          source: 'legacy_activity' as const,
        })),
        ...taskDueFollowUpRows.map(row => ({
          ...row,
          agentId: row.agentId ?? actor.actorId,
          completedAt: null,
          subject: 'Follow up',
          source: 'crm_task' as const,
          type: CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE,
        })),
      ],
      leadCounts,
      paidCommissionTotal: totalCommission?.total ?? 0,
    };
  },
};
