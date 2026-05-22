import {
  CRM_TASK_COMPLETED_QUEUE_PAGE_SIZE,
  CRM_TASK_WORK_QUEUE_PAGE_SIZE,
  deriveCrmTaskCompletedQueue,
  deriveCrmTaskWorkQueue,
  type CrmTaskCompletedQueueInputRow,
  type CrmTaskCompletedQueueItem,
  type CrmTaskWorkQueueInputRow,
  type CrmTaskWorkQueueItem,
} from '@interdomestik/domain-crm/tasks';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { db } from '@interdomestik/database/db';
import { crmLeads, crmTasks } from '@interdomestik/database/schema';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

type AgentCrmTaskWorkQueueDb = typeof db;
type AgentCrmTaskQueueLeadRow = {
  assignedActorId: string | null;
  branchId: string | null;
  companyName: string | null;
  dueAt: Date | string | null;
  fullName: string | null;
  leadId: string;
  lifecycleVersion: number;
  taskId: string;
  tenantId: string;
};

export type AgentCrmTaskWorkQueueReadInput = {
  actor: CrmActorContext;
  limit?: number;
  now: string;
};

export type AgentCrmTaskWorkQueueRepository = {
  readAgentCompletedTaskQueue(
    input: AgentCrmTaskWorkQueueReadInput
  ): Promise<CrmTaskCompletedQueueItem[]>;
  readAgentTaskWorkQueue(input: AgentCrmTaskWorkQueueReadInput): Promise<CrmTaskWorkQueueItem[]>;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function leadDisplayLabel(row: {
  companyName: string | null;
  fullName: string | null;
}): string | null {
  return row.fullName || row.companyName || null;
}

function leadVisibilityJoin(actor: CrmActorContext, branchId: string) {
  return and(
    eq(crmLeads.id, crmTasks.subjectId),
    eq(crmLeads.tenantId, actor.tenantId),
    eq(crmLeads.agentId, actor.actorId),
    eq(crmLeads.branchId, branchId)
  );
}

function assignedLeadTaskConditions(actor: CrmActorContext, branchId: string) {
  return [
    eq(crmTasks.tenantId, actor.tenantId),
    eq(crmTasks.branchId, branchId),
    eq(crmTasks.subjectKind, 'lead'),
    eq(crmTasks.assignedKind, 'actor'),
    eq(crmTasks.assignedActorId, actor.actorId),
  ];
}

function toLeadQueueInput(row: AgentCrmTaskQueueLeadRow) {
  return {
    assignedActorId: row.assignedActorId,
    branchId: row.branchId,
    dueAt: toIso(row.dueAt),
    leadDisplayRef: {
      id: row.leadId,
      label: leadDisplayLabel(row),
    },
    lifecycleVersion: row.lifecycleVersion,
    subjectReference: { id: row.leadId, kind: 'lead' as const },
    taskId: row.taskId,
    tenantId: row.tenantId,
  };
}

export function createAgentCrmTaskWorkQueueRepository(
  database: AgentCrmTaskWorkQueueDb = db
): AgentCrmTaskWorkQueueRepository {
  return {
    async readAgentCompletedTaskQueue(input) {
      const { actor } = input;
      const branchId = actor.scope.branchId ?? null;
      const limit = input.limit ?? CRM_TASK_COMPLETED_QUEUE_PAGE_SIZE;

      if (actor.role !== 'agent' || actor.scope.agentId !== actor.actorId || !branchId) {
        return [];
      }

      // db-access-guard: tenant-scoped -- reason: CRM32 completed task queue constrains by actor tenant, branch, assignment, completed status, and joined lead visibility before deriving queue DTOs.
      const rows = await database
        .select({
          assignedActorId: crmTasks.assignedActorId,
          branchId: crmTasks.branchId,
          companyName: crmLeads.companyName,
          completedAt: crmTasks.completedAt,
          completionReasonCode: crmTasks.completionReasonCode,
          dueAt: crmTasks.dueAt,
          fullName: crmLeads.fullName,
          leadId: crmTasks.subjectId,
          lifecycleVersion: crmTasks.lifecycleVersion,
          priority: crmTasks.priority,
          status: crmTasks.status,
          taskId: crmTasks.id,
          tenantId: crmTasks.tenantId,
        })
        .from(crmTasks)
        .innerJoin(crmLeads, leadVisibilityJoin(actor, branchId))
        .where(
          and(
            ...assignedLeadTaskConditions(actor, branchId),
            eq(crmTasks.status, 'completed'),
            isNotNull(crmTasks.completedAt)
          )
        )
        .orderBy(desc(crmTasks.completedAt), asc(crmTasks.id))
        .limit(limit * 2);

      const queueRows: CrmTaskCompletedQueueInputRow[] = rows.map(row => ({
        ...toLeadQueueInput(row),
        completedAt: toIso(row.completedAt),
        completionReasonCode:
          row.completionReasonCode as CrmTaskCompletedQueueInputRow['completionReasonCode'],
        priority: row.priority as CrmTaskCompletedQueueInputRow['priority'],
        status: row.status as CrmTaskCompletedQueueInputRow['status'],
      }));

      return deriveCrmTaskCompletedQueue({
        actorId: actor.actorId,
        branchId,
        limit,
        rows: queueRows,
        tenantId: actor.tenantId,
      });
    },
    async readAgentTaskWorkQueue(input) {
      const { actor, now } = input;
      const branchId = actor.scope.branchId ?? null;
      const limit = input.limit ?? CRM_TASK_WORK_QUEUE_PAGE_SIZE;

      if (actor.role !== 'agent' || actor.scope.agentId !== actor.actorId || !branchId) {
        return [];
      }

      // db-access-guard: tenant-scoped -- reason: CRM28 task queue constrains by actor tenant, branch, assignment, and joined lead visibility before deriving queue DTOs.
      const rows = await database
        .select({
          assignedActorId: crmTasks.assignedActorId,
          branchId: crmTasks.branchId,
          companyName: crmLeads.companyName,
          createReasonCode: crmTasks.createReasonCode,
          dueAt: crmTasks.dueAt,
          fullName: crmLeads.fullName,
          leadId: crmTasks.subjectId,
          lifecycleVersion: crmTasks.lifecycleVersion,
          priority: crmTasks.priority,
          status: crmTasks.status,
          taskId: crmTasks.id,
          tenantId: crmTasks.tenantId,
        })
        .from(crmTasks)
        .innerJoin(crmLeads, leadVisibilityJoin(actor, branchId))
        .where(
          and(
            ...assignedLeadTaskConditions(actor, branchId),
            inArray(crmTasks.status, ['pending', 'in_progress'])
          )
        )
        .orderBy(
          sql`case when ${crmTasks.dueAt} is null then 1 else 0 end`,
          asc(crmTasks.dueAt),
          sql`case ${crmTasks.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
          asc(crmTasks.id)
        )
        .limit(limit * 2);

      const queueRows: CrmTaskWorkQueueInputRow[] = rows.map(row => ({
        ...toLeadQueueInput(row),
        createReasonCode: row.createReasonCode as CrmTaskWorkQueueInputRow['createReasonCode'],
        priority: row.priority as CrmTaskWorkQueueInputRow['priority'],
        status: row.status as CrmTaskWorkQueueInputRow['status'],
      }));

      return deriveCrmTaskWorkQueue({
        actorId: actor.actorId,
        branchId,
        limit,
        now,
        rows: queueRows,
        tenantId: actor.tenantId,
      });
    },
  };
}

export const agentCrmTaskWorkQueueRepository = createAgentCrmTaskWorkQueueRepository();
