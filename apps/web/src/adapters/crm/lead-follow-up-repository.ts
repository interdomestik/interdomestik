import {
  CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE,
  type CreateCrmLeadFollowUpActivity,
  type CrmLeadFollowUpRepository,
} from '@interdomestik/domain-crm/leads/follow-up';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { CrmLead, CrmLeadActivity } from '@interdomestik/domain-crm/leads/types';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import { crmActivities, crmLeads, crmTasks } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';

type CrmLeadRow = typeof crmLeads.$inferSelect;
type CrmActivityRow = typeof crmActivities.$inferSelect;
type CrmActivityCompatRow = Pick<
  CrmActivityRow,
  | 'agentId'
  | 'branchId'
  | 'completedAt'
  | 'createdAt'
  | 'id'
  | 'leadId'
  | 'scheduledAt'
  | 'tenantId'
  | 'type'
> & {
  subject: string;
};
type CrmTaskFollowUpRow = {
  agentId: string | null;
  branchId: string | null;
  createdAt: Date | string;
  expectedLifecycleVersion: number;
  leadId: string;
  scheduledAt: Date | string | null;
  taskId: string;
  tenantId: string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapLead(row: CrmLeadRow): CrmLead {
  return {
    agentId: row.agentId,
    branchId: row.branchId ?? null,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    id: row.id,
    score: row.score,
    source: row.source,
    stage: row.stage,
    tenantId: row.tenantId,
    type: row.type,
    updatedAt: toIso(row.updatedAt),
  };
}

function mapActivityCompat(row: CrmActivityCompatRow): CrmLeadActivity {
  return {
    agentId: row.agentId,
    branchId: row.branchId ?? null,
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    description: null,
    id: row.id,
    leadId: row.leadId,
    occurredAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    scheduledAt: toIso(row.scheduledAt),
    subject: row.subject,
    tenantId: row.tenantId,
    type: row.type,
  };
}

export const crmLeadFollowUpRepository: CrmLeadFollowUpRepository = {
  async findById(params: { actor: CrmActorContext; leadId: string }) {
    // db-access-guard: tenant-scoped -- reason: tenantId comes from explicit authorized CRM actor context before follow-up authorization
    const lead = await db.query.crmLeads.findFirst({
      where: withTenant(params.actor.tenantId, crmLeads.tenantId, eq(crmLeads.id, params.leadId)),
    });
    if (!lead) return null;
    return mapLead(lead);
  },

  async createFollowUpActivity(params: {
    activity: CreateCrmLeadFollowUpActivity;
    actor: CrmActorContext;
  }) {
    const branchId = params.actor.scope.branchId;
    if (!branchId) {
      throw new Error('CRM follow-up activity creation requires actor branch scope');
    }

    // db-access-guard: tenant-scoped -- reason: tenantId from authorized agent context is included in follow-up insert values
    const rows = await db.execute(sql`
      insert into "crm_activities"
        ("id", "tenant_id", "lead_id", "agent_id", "branch_id", "type", "summary", "scheduled_at", "completed_at", "created_at")
      values
        (
          ${params.activity.id},
          ${params.activity.tenantId},
          ${params.activity.leadId},
          ${params.actor.actorId},
          ${branchId},
          ${params.activity.type},
          ${params.activity.subject},
          ${params.activity.scheduledAt},
          null,
          ${params.activity.createdAt}
        )
      returning
        "id",
        "tenant_id" as "tenantId",
        "lead_id" as "leadId",
        "agent_id" as "agentId",
        "branch_id" as "branchId",
        "type",
        "summary" as "subject",
        "scheduled_at" as "scheduledAt",
        "completed_at" as "completedAt",
        "created_at" as "createdAt"
    `);
    const [created] = rows as unknown as CrmActivityCompatRow[];

    return mapActivityCompat(created);
  },

  async completeFollowUpActivity(params: {
    activityId: string;
    actor: CrmActorContext;
    completedAt: string;
    leadId: string;
  }) {
    // db-access-guard: tenant-scoped -- reason: tenantId from authorized agent context constrains follow-up completion update
    const rows = await db.execute(sql`
      update "crm_activities"
      set "completed_at" = ${params.completedAt}
      where "id" = ${params.activityId}
        and "lead_id" = ${params.leadId}
        and "tenant_id" = ${params.actor.tenantId}
        and "agent_id" = ${params.actor.actorId}
        and "type" = ${CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE}
        and "completed_at" is null
      returning
        "id",
        "tenant_id" as "tenantId",
        "lead_id" as "leadId",
        "agent_id" as "agentId",
        "branch_id" as "branchId",
        "type",
        "summary" as "subject",
        "scheduled_at" as "scheduledAt",
        "completed_at" as "completedAt",
        "created_at" as "createdAt"
    `);
    const [updated] = rows as unknown as CrmActivityCompatRow[];

    return updated ? mapActivityCompat(updated) : null;
  },
};

export async function listCrmLeadFollowUpActivitiesForLead(params: {
  actor: CrmActorContext;
  leadId: string;
  limit?: number;
}): Promise<CrmLeadActivity[]> {
  const branchId = params.actor.scope.branchId;
  if (!branchId) return [];

  // db-access-guard: tenant-scoped -- reason: tenant, branch, assigned actor, and lead visibility constrain legacy follow-up reads
  const rows = await db
    .select({
      agentId: crmActivities.agentId,
      branchId: crmActivities.branchId,
      completedAt: crmActivities.completedAt,
      createdAt: crmActivities.createdAt,
      id: crmActivities.id,
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
        eq(crmLeads.tenantId, params.actor.tenantId),
        eq(crmLeads.agentId, params.actor.actorId),
        eq(crmLeads.branchId, branchId)
      )
    )
    .where(
      and(
        eq(crmActivities.tenantId, params.actor.tenantId),
        eq(crmActivities.agentId, params.actor.actorId),
        eq(crmActivities.branchId, branchId),
        eq(crmActivities.leadId, params.leadId),
        eq(crmActivities.type, CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE)
      )
    )
    .limit(params.limit ?? 25);

  return rows.map(row => ({
    agentId: row.agentId,
    branchId: row.branchId ?? null,
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    description: null,
    id: row.id,
    leadId: row.leadId,
    occurredAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    scheduledAt: toIso(row.scheduledAt),
    subject: row.subject,
    tenantId: row.tenantId,
    type: row.type,
  }));
}

export async function listCrmLeadFollowUpTasksForLead(params: {
  actor: CrmActorContext;
  leadId: string;
  limit?: number;
}): Promise<CrmLeadActivity[]> {
  const branchId = params.actor.scope.branchId;
  if (!branchId) return [];

  // db-access-guard: tenant-scoped -- reason: tenant, branch, assigned actor, and lead visibility constrain task-backed follow-up reads
  const rows = await db
    .select({
      agentId: crmTasks.assignedActorId,
      branchId: crmTasks.branchId,
      createdAt: crmTasks.createdAt,
      expectedLifecycleVersion: crmTasks.lifecycleVersion,
      leadId: crmTasks.subjectId,
      scheduledAt: crmTasks.dueAt,
      taskId: crmTasks.id,
      tenantId: crmTasks.tenantId,
    })
    .from(crmTasks)
    .innerJoin(
      crmLeads,
      and(
        eq(crmLeads.id, crmTasks.subjectId),
        eq(crmLeads.tenantId, params.actor.tenantId),
        eq(crmLeads.agentId, params.actor.actorId),
        eq(crmLeads.branchId, branchId)
      )
    )
    .where(
      and(
        eq(crmTasks.tenantId, params.actor.tenantId),
        eq(crmTasks.branchId, branchId),
        eq(crmTasks.subjectKind, 'lead'),
        eq(crmTasks.subjectId, params.leadId),
        eq(crmTasks.createReasonCode, CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE),
        eq(crmTasks.assignedKind, 'actor'),
        eq(crmTasks.assignedActorId, params.actor.actorId),
        inArray(crmTasks.status, ['pending', 'in_progress'])
      )
    )
    .orderBy(asc(crmTasks.dueAt), asc(crmTasks.id))
    .limit(params.limit ?? 25);

  return (rows as CrmTaskFollowUpRow[]).map(
    row =>
      ({
        agentId: row.agentId ?? params.actor.actorId,
        branchId: row.branchId ?? null,
        completedAt: null,
        createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
        description: null,
        expectedLifecycleVersion: row.expectedLifecycleVersion,
        followUpSource: 'crm_task',
        id: row.taskId,
        leadId: row.leadId,
        occurredAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
        scheduledAt: toIso(row.scheduledAt),
        subject: 'Follow up',
        tenantId: row.tenantId,
        type: CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE,
      }) as CrmLeadActivity
  );
}
