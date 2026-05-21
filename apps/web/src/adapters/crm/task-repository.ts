import type {
  CrmTask,
  CrmTaskActorSnapshot,
  CrmTaskAssignableRole,
  CrmTaskAssignmentTarget,
  CrmTaskHistoryEntry,
  CrmTaskRepository,
  CrmTaskSubjectReference,
  CrmTaskSubjectVisibility,
} from '@interdomestik/domain-crm/tasks';
import { CrmTaskRepositoryFailure } from '@interdomestik/domain-crm/tasks';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import {
  crmDeals,
  crmLeads,
  crmTaskHistory,
  crmTasks,
  supportHandoffs,
} from '@interdomestik/database/schema';

type CrmTaskDb = typeof db;
type CrmTaskRow = typeof crmTasks.$inferSelect;
type CrmTaskHistoryRow = typeof crmTaskHistory.$inferSelect;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function requireIso(value: Date | string | null | undefined, label: string): string {
  const iso = toIso(value);
  if (!iso) throw new Error(`CRM task row is missing ${label}`);
  return iso;
}

function actorBranchId(actor: CrmActorContext): string | null {
  return actor.scope.branchId ?? null;
}

function branchVisible(actor: CrmActorContext, branchId: string | null): boolean {
  if (actor.role === 'admin') return true;
  if (!branchId) return false;
  return actorBranchId(actor) === branchId;
}

function taskVisibilityPredicate(actor: CrmActorContext, taskId?: string) {
  const predicates = [eq(crmTasks.tenantId, actor.tenantId)];
  if (taskId) predicates.push(eq(crmTasks.id, taskId));
  if (actor.role !== 'admin') {
    const branchId = actorBranchId(actor);
    if (!branchId) return and(...predicates, sql`false`);
    predicates.push(eq(crmTasks.branchId, branchId));
  }
  return and(...predicates);
}

function mapAssignment(row: CrmTaskRow): CrmTaskAssignmentTarget {
  if (row.assignedKind === 'unassigned') return { kind: 'unassigned' };
  if (row.assignedKind === 'actor') {
    if (!row.assignedActorId || !row.assignedRole) {
      throw new Error('CRM task row has malformed actor assignment');
    }
    return {
      actorId: row.assignedActorId,
      branchId: row.assignedBranchId ?? null,
      kind: 'actor',
      role: row.assignedRole as CrmTaskAssignableRole,
      tenantId: row.assignedTenantId ?? null,
    };
  }
  if (row.assignedKind === 'role') {
    if (!row.assignedRole) throw new Error('CRM task row has malformed role assignment');
    return {
      branchId: row.assignedBranchId ?? null,
      kind: 'role',
      role: row.assignedRole as CrmTaskAssignableRole,
      tenantId: row.assignedTenantId ?? null,
    };
  }
  if (row.assignedKind === 'team') {
    if (!row.assignedTeamId) throw new Error('CRM task row has malformed team assignment');
    return {
      branchId: row.assignedBranchId ?? null,
      kind: 'team',
      teamId: row.assignedTeamId,
      tenantId: row.assignedTenantId ?? null,
    };
  }
  throw new Error(`CRM task row has unsupported assignment kind ${row.assignedKind}`);
}

function actorSnapshot(
  row: Pick<CrmTaskRow, 'createdByBranchId' | 'createdById' | 'createdByRole' | 'tenantId'>
): CrmTaskActorSnapshot {
  return {
    actorId: row.createdById,
    branchId: row.createdByBranchId ?? null,
    role: row.createdByRole as CrmTaskActorSnapshot['role'],
    tenantId: row.tenantId,
  };
}

function historyActorSnapshot(row: CrmTaskHistoryRow): CrmTaskActorSnapshot {
  return {
    actorId: row.actorId,
    branchId: row.actorBranchId ?? null,
    role: row.actorRole as CrmTaskActorSnapshot['role'],
    tenantId: row.tenantId,
  };
}

function mapHistoryEntry(row: CrmTaskHistoryRow): CrmTaskHistoryEntry {
  return {
    actor: historyActorSnapshot(row),
    event: row.event as CrmTaskHistoryEntry['event'],
    fromStatus: row.fromStatus as CrmTaskHistoryEntry['fromStatus'],
    reasonCode: row.reasonCode as CrmTaskHistoryEntry['reasonCode'],
    timestamp: requireIso(row.occurredAt, 'history occurredAt'),
    toStatus: row.toStatus as CrmTaskHistoryEntry['toStatus'],
  };
}

function mapTask(row: CrmTaskRow, historyRows: readonly CrmTaskHistoryRow[]): CrmTask {
  return {
    assignedTo: mapAssignment(row),
    branchId: row.branchId ?? null,
    cancelledAt: toIso(row.cancelledAt),
    cancellationReasonCode: row.cancellationReasonCode as CrmTask['cancellationReasonCode'],
    completedAt: toIso(row.completedAt),
    completionReasonCode: row.completionReasonCode as CrmTask['completionReasonCode'],
    createReasonCode: row.createReasonCode as CrmTask['createReasonCode'],
    createdAt: requireIso(row.createdAt, 'createdAt'),
    createdBy: actorSnapshot(row),
    dueAt: toIso(row.dueAt),
    history: historyRows.map(mapHistoryEntry),
    idempotencyKey: row.idempotencyKey ?? null,
    lifecycleVersion: row.lifecycleVersion,
    priority: row.priority as CrmTask['priority'],
    reopenedAt: toIso(row.reopenedAt),
    reopenReasonCode: row.reopenReasonCode as CrmTask['reopenReasonCode'],
    status: row.status as CrmTask['status'],
    subjectReference: {
      id: row.subjectId,
      kind: row.subjectKind as CrmTaskSubjectReference['kind'],
    },
    taskId: row.id,
    tenantId: row.tenantId,
    updatedAt: requireIso(row.updatedAt, 'updatedAt'),
  };
}

function assignmentValues(assignedTo: CrmTaskAssignmentTarget) {
  if (assignedTo.kind === 'unassigned') {
    return {
      assignedActorId: null,
      assignedBranchId: null,
      assignedKind: 'unassigned',
      assignedRole: null,
      assignedTeamId: null,
      assignedTenantId: null,
    };
  }
  if (assignedTo.kind === 'actor') {
    return {
      assignedActorId: assignedTo.actorId,
      assignedBranchId: assignedTo.branchId ?? null,
      assignedKind: 'actor',
      assignedRole: assignedTo.role,
      assignedTeamId: null,
      assignedTenantId: assignedTo.tenantId ?? null,
    };
  }
  if (assignedTo.kind === 'role') {
    return {
      assignedActorId: null,
      assignedBranchId: assignedTo.branchId ?? null,
      assignedKind: 'role',
      assignedRole: assignedTo.role,
      assignedTeamId: null,
      assignedTenantId: assignedTo.tenantId ?? null,
    };
  }
  return {
    assignedActorId: null,
    assignedBranchId: assignedTo.branchId ?? null,
    assignedKind: 'team',
    assignedRole: null,
    assignedTeamId: assignedTo.teamId,
    assignedTenantId: assignedTo.tenantId ?? null,
  };
}

function taskValues(task: CrmTask) {
  return {
    ...assignmentValues(task.assignedTo),
    branchId: task.branchId,
    cancelledAt: toDate(task.cancelledAt),
    cancellationReasonCode: task.cancellationReasonCode,
    completedAt: toDate(task.completedAt),
    completionReasonCode: task.completionReasonCode,
    createReasonCode: task.createReasonCode,
    createdAt: new Date(task.createdAt),
    createdByBranchId: task.createdBy.branchId ?? null,
    createdById: task.createdBy.actorId,
    createdByRole: task.createdBy.role,
    dueAt: toDate(task.dueAt),
    id: task.taskId,
    idempotencyKey: task.idempotencyKey,
    lifecycleVersion: task.lifecycleVersion,
    priority: task.priority,
    reopenedAt: toDate(task.reopenedAt),
    reopenReasonCode: task.reopenReasonCode,
    status: task.status,
    subjectId: task.subjectReference.id,
    subjectKind: task.subjectReference.kind,
    tenantId: task.tenantId,
    updatedAt: new Date(task.updatedAt),
  };
}

function historyValues(taskId: string, entry: CrmTaskHistoryEntry, id = randomUUID()) {
  return {
    actorBranchId: entry.actor.branchId ?? null,
    actorId: entry.actor.actorId,
    actorRole: entry.actor.role,
    createdAt: new Date(),
    event: entry.event,
    fromStatus: entry.fromStatus,
    id,
    occurredAt: new Date(entry.timestamp),
    reasonCode: entry.reasonCode,
    taskId,
    tenantId: entry.actor.tenantId,
    toStatus: entry.toStatus,
  };
}

function idempotencyMaterial(task: CrmTask): string {
  return JSON.stringify({
    assignedTo: task.assignedTo,
    createReasonCode: task.createReasonCode,
    createdBy: task.createdBy,
    dueAt: task.dueAt,
    priority: task.priority,
    subjectReference: task.subjectReference,
    tenantId: task.tenantId,
  });
}

async function hydrateVisibleTask(
  database: Pick<CrmTaskDb, 'query'>,
  actor: CrmActorContext,
  row: CrmTaskRow
): Promise<CrmTask | null> {
  if (!branchVisible(actor, row.branchId ?? null)) return null;
  const visibility = await validateSubjectReference(database, {
    actor,
    subjectReference: {
      id: row.subjectId,
      kind: row.subjectKind as CrmTaskSubjectReference['kind'],
    },
  });
  if (!visibility.visible) return null;

  const historyRows = await database.query.crmTaskHistory.findMany({
    orderBy: [
      asc(crmTaskHistory.occurredAt),
      asc(crmTaskHistory.createdAt),
      asc(crmTaskHistory.id),
    ],
    where: and(eq(crmTaskHistory.tenantId, actor.tenantId), eq(crmTaskHistory.taskId, row.id)),
  });

  return mapTask(row, historyRows);
}

async function validateSubjectReference(
  database: Pick<CrmTaskDb, 'query'>,
  params: {
    actor: CrmActorContext;
    subjectReference: CrmTaskSubjectReference;
  }
): Promise<CrmTaskSubjectVisibility> {
  const { actor, subjectReference } = params;
  if (subjectReference.kind === 'account' || subjectReference.kind === 'contact') {
    return { reason: 'subject_proof_missing', visible: false };
  }

  if (subjectReference.kind === 'lead') {
    const row = await database.query.crmLeads.findFirst({
      where: and(eq(crmLeads.id, subjectReference.id), eq(crmLeads.tenantId, actor.tenantId)),
    });
    if (!row) return { reason: 'subject_not_found', visible: false };
    if (actor.role === 'agent' && row.agentId !== actor.actorId) {
      return { reason: 'subject_not_visible', visible: false };
    }
    if (!branchVisible(actor, row.branchId ?? null)) {
      return { reason: 'subject_not_visible', visible: false };
    }
    return { branchId: row.branchId ?? null, tenantId: row.tenantId, visible: true };
  }

  if (subjectReference.kind === 'deal') {
    const row = await database.query.crmDeals.findFirst({
      where: and(
        eq(crmDeals.id, subjectReference.id),
        eq(crmDeals.tenantId, actor.tenantId),
        isNull(crmDeals.archivedAt)
      ),
    });
    if (!row) return { reason: 'subject_not_found', visible: false };
    if (!branchVisible(actor, row.branchId ?? null)) {
      return { reason: 'subject_not_visible', visible: false };
    }
    return { branchId: row.branchId ?? null, tenantId: row.tenantId, visible: true };
  }

  const row = await database.query.supportHandoffs.findFirst({
    where: and(
      eq(supportHandoffs.id, subjectReference.id),
      eq(supportHandoffs.tenantId, actor.tenantId)
    ),
  });
  if (!row) return { reason: 'subject_not_found', visible: false };
  if (!branchVisible(actor, row.branchId ?? null)) {
    return { reason: 'subject_not_visible', visible: false };
  }
  return { branchId: row.branchId ?? null, tenantId: row.tenantId, visible: true };
}

export function createCrmTaskRepository(database: CrmTaskDb = db): CrmTaskRepository {
  return {
    async appendTaskHistory(params) {
      const existingRow = await database.query.crmTasks.findFirst({
        where: taskVisibilityPredicate(params.actor, params.taskId),
      });
      if (!existingRow) throw new CrmTaskRepositoryFailure('lifecycle_conflict');

      const visibility = await validateSubjectReference(database, {
        actor: params.actor,
        subjectReference: {
          id: existingRow.subjectId,
          kind: existingRow.subjectKind as CrmTaskSubjectReference['kind'],
        },
      });
      if (!visibility.visible) throw new CrmTaskRepositoryFailure(visibility.reason);
      if (visibility.branchId !== (existingRow.branchId ?? null)) {
        throw new CrmTaskRepositoryFailure('subject_not_visible');
      }

      // db-access-guard: tenant-scoped -- reason: CRM task history append constrains by actor tenant, branch-visible task id, and expected lifecycle version.
      const [row] = await database.transaction(async tx => {
        const [updated] = await tx
          .update(crmTasks)
          .set({
            lifecycleVersion: sql`${crmTasks.lifecycleVersion} + 1`,
            status: params.entry.toStatus,
            updatedAt: new Date(params.entry.timestamp),
          })
          .where(
            and(
              taskVisibilityPredicate(params.actor, params.taskId),
              eq(crmTasks.lifecycleVersion, params.expectedLifecycleVersion)
            )
          )
          .returning();

        if (!updated) throw new CrmTaskRepositoryFailure('lifecycle_conflict');
        await tx.insert(crmTaskHistory).values(historyValues(params.taskId, params.entry));
        return [updated];
      });

      const task = await hydrateVisibleTask(database, params.actor, row);
      if (!task) throw new CrmTaskRepositoryFailure('subject_not_visible');
      return task;
    },

    async findTaskById(params) {
      // db-access-guard: tenant-scoped -- reason: CRM task lookup constrains by actor tenant and branch-visible task id before hydration.
      const row = await database.query.crmTasks.findFirst({
        where: taskVisibilityPredicate(params.actor, params.taskId),
      });
      return row ? hydrateVisibleTask(database, params.actor, row) : null;
    },

    async findTaskByIdempotencyKey(params) {
      // db-access-guard: tenant-scoped -- reason: CRM task idempotency lookup constrains by actor tenant, branch visibility, and opaque idempotency key.
      const row = await database.query.crmTasks.findFirst({
        where: and(
          taskVisibilityPredicate(params.actor),
          eq(crmTasks.idempotencyKey, params.idempotencyKey)
        ),
      });
      return row ? hydrateVisibleTask(database, params.actor, row) : null;
    },

    async saveTask(params) {
      const visibility = await validateSubjectReference(database, {
        actor: params.actor,
        subjectReference: params.task.subjectReference,
      });
      if (!visibility.visible) throw new CrmTaskRepositoryFailure(visibility.reason);
      if (visibility.branchId !== params.task.branchId) {
        throw new CrmTaskRepositoryFailure('subject_not_visible');
      }
      if (!branchVisible(params.actor, params.task.branchId)) {
        throw new CrmTaskRepositoryFailure('subject_not_visible');
      }

      if (params.expectedLifecycleVersion == null) {
        if (params.task.lifecycleVersion !== 1) {
          throw new CrmTaskRepositoryFailure('lifecycle_conflict');
        }
        if (params.task.idempotencyKey) {
          const existingRow = await database.query.crmTasks.findFirst({
            where: and(
              eq(crmTasks.tenantId, params.actor.tenantId),
              eq(crmTasks.idempotencyKey, params.task.idempotencyKey)
            ),
          });
          if (existingRow) {
            const existing = await hydrateVisibleTask(database, params.actor, existingRow);
            if (!existing) throw new CrmTaskRepositoryFailure('idempotency_conflict');
            if (idempotencyMaterial(existing) !== idempotencyMaterial(params.task)) {
              throw new CrmTaskRepositoryFailure('idempotency_conflict');
            }
            return existing;
          }
        }

        const [row] = await database.transaction(async tx => {
          const [created] = await tx.insert(crmTasks).values(taskValues(params.task)).returning();
          await tx
            .insert(crmTaskHistory)
            .values(params.task.history.map(entry => historyValues(params.task.taskId, entry)));
          return [created];
        });
        const task = await hydrateVisibleTask(database, params.actor, row);
        if (!task) throw new CrmTaskRepositoryFailure('subject_not_visible');
        return task;
      }

      const expectedLifecycleVersion = params.expectedLifecycleVersion;
      if (params.task.lifecycleVersion !== expectedLifecycleVersion + 1) {
        throw new CrmTaskRepositoryFailure('lifecycle_conflict');
      }
      // db-access-guard: tenant-scoped -- reason: CRM task save constrains by actor tenant, branch-visible task id, and expected lifecycle version.
      const [row] = await database.transaction(async tx => {
        const [updated] = await tx
          .update(crmTasks)
          .set(taskValues(params.task))
          .where(
            and(
              taskVisibilityPredicate(params.actor, params.task.taskId),
              eq(crmTasks.lifecycleVersion, expectedLifecycleVersion)
            )
          )
          .returning();
        if (!updated) throw new CrmTaskRepositoryFailure('lifecycle_conflict');

        const newest = params.task.history.at(-1);
        if (newest) {
          await tx.insert(crmTaskHistory).values(historyValues(params.task.taskId, newest));
        }
        return [updated];
      });
      const task = await hydrateVisibleTask(database, params.actor, row);
      if (!task) throw new CrmTaskRepositoryFailure('subject_not_visible');
      return task;
    },

    validateSubjectReference(params) {
      return validateSubjectReference(database, params);
    },
  };
}

export const crmTaskRepository = createCrmTaskRepository();
