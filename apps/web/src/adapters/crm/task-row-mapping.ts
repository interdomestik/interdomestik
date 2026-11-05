import type {
  CrmTask,
  CrmTaskActorSnapshot,
  CrmTaskAssignableRole,
  CrmTaskAssignmentTarget,
  CrmTaskHistoryEntry,
  CrmTaskSubjectReference,
} from '@interdomestik/domain-crm/tasks';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { crmTaskHistory, crmTasks } from '@interdomestik/database/schema';

// CRM task row mapping and visibility predicates: no database access.

export type CrmTaskRow = typeof crmTasks.$inferSelect;
export type CrmTaskHistoryRow = typeof crmTaskHistory.$inferSelect;

const IDEMPOTENCY_UNIQUE_CONSTRAINT = 'crm_tasks_tenant_idempotency_uq';

function databaseErrorRecord(error: unknown): Record<string, unknown> | null {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
}

export function isIdempotencyUniqueViolation(error: unknown): boolean {
  const record = databaseErrorRecord(error);
  if (!record) return false;
  const code = typeof record.code === 'string' ? record.code : null;
  const constraint = typeof record.constraint === 'string' ? record.constraint : null;
  const message = typeof record.message === 'string' ? record.message : '';
  if (
    code === '23505' &&
    (constraint === IDEMPOTENCY_UNIQUE_CONSTRAINT ||
      message.includes(IDEMPOTENCY_UNIQUE_CONSTRAINT))
  ) {
    return true;
  }
  return isIdempotencyUniqueViolation(record.cause);
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function requireIso(value: Date | string | null | undefined, label: string): string {
  const iso = toIso(value);
  if (!iso) throw new Error(`CRM task row is missing ${label}`);
  return iso;
}

export function actorBranchId(actor: CrmActorContext): string | null {
  return actor.scope.branchId ?? null;
}

export function branchVisible(actor: CrmActorContext, branchId: string | null): boolean {
  if (actor.role === 'admin') return true;
  if (!branchId) return false;
  return actorBranchId(actor) === branchId;
}

export function taskVisibilityPredicate(actor: CrmActorContext, taskId?: string) {
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

export function mapTask(row: CrmTaskRow, historyRows: readonly CrmTaskHistoryRow[]): CrmTask {
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

export function taskValues(task: CrmTask) {
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

export function historyValues(taskId: string, entry: CrmTaskHistoryEntry, id = randomUUID()) {
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

export function idempotencyMaterial(task: CrmTask): string {
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
