import {
  CRM_TASK_WORK_QUEUE_PAGE_SIZE,
  deriveCrmTaskWorkQueue,
  type CrmTaskWorkQueueInputRow,
  type CrmTaskWorkQueueItem,
} from '@interdomestik/domain-crm/tasks';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { db } from '@interdomestik/database/db';
import { crmLeads, crmTasks } from '@interdomestik/database/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

type AgentCrmTaskWorkQueueDb = typeof db;

export type AgentCrmTaskWorkQueueReadInput = {
  actor: CrmActorContext;
  limit?: number;
  now: string;
};

export type AgentCrmTaskWorkQueueRepository = {
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

export function createAgentCrmTaskWorkQueueRepository(
  database: AgentCrmTaskWorkQueueDb = db
): AgentCrmTaskWorkQueueRepository {
  return {
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
            eq(crmTasks.assignedKind, 'actor'),
            eq(crmTasks.assignedActorId, actor.actorId),
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
        assignedActorId: row.assignedActorId,
        branchId: row.branchId,
        createReasonCode: row.createReasonCode as CrmTaskWorkQueueInputRow['createReasonCode'],
        dueAt: toIso(row.dueAt),
        leadDisplayRef: {
          id: row.leadId,
          label: leadDisplayLabel(row),
        },
        lifecycleVersion: row.lifecycleVersion,
        priority: row.priority as CrmTaskWorkQueueInputRow['priority'],
        status: row.status as CrmTaskWorkQueueInputRow['status'],
        subjectReference: { id: row.leadId, kind: 'lead' },
        taskId: row.taskId,
        tenantId: row.tenantId,
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
