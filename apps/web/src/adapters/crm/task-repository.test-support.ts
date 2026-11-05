import { vi } from 'vitest';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { createCrmTask, type CrmTask } from '@interdomestik/domain-crm/tasks';
import { crmTasks } from '@interdomestik/database/schema';
import type { CrmTenantExecutor } from './tenant-runner';

const hoisted = vi.hoisted(() => ({
  db: {},
}));

vi.mock('@interdomestik/database/db', () => ({
  db: hoisted.db,
}));

export type TaskRepositoryDb = CrmTenantExecutor;

export const now = new Date('2026-05-21T08:00:00.000Z');

export const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

export function createTask(): CrmTask {
  const result = createCrmTask(
    {
      actor: agentActor,
      assignedTo: {
        actorId: 'agent-1',
        branchId: 'branch-1',
        kind: 'actor',
        role: 'agent',
        tenantId: 'tenant-1',
      },
      dueAt: '2026-05-22T10:00:00.000Z',
      idempotencyKey: 'crm25-task-create',
      priority: 'high',
      subjectProof: {
        branchId: 'branch-1',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        tenantId: 'tenant-1',
      },
      subjectReference: { id: 'lead-1', kind: 'lead' },
      tenantId: 'tenant-1',
    },
    {
      now: () => now.toISOString(),
      taskId: () => 'task-1',
    }
  );
  if (!result.success) throw new Error(result.reason);
  return result.task;
}

export function rowFromTask(task: CrmTask) {
  const assignedTo = task.assignedTo;
  return {
    assignedActorId: assignedTo.kind === 'actor' ? assignedTo.actorId : null,
    assignedBranchId: assignedTo.kind === 'unassigned' ? null : assignedTo.branchId,
    assignedKind: assignedTo.kind,
    assignedRole:
      assignedTo.kind === 'actor' || assignedTo.kind === 'role' ? assignedTo.role : null,
    assignedTeamId: assignedTo.kind === 'team' ? assignedTo.teamId : null,
    assignedTenantId: assignedTo.kind === 'unassigned' ? null : assignedTo.tenantId,
    branchId: task.branchId,
    cancelledAt: task.cancelledAt ? new Date(task.cancelledAt) : null,
    cancellationReasonCode: task.cancellationReasonCode,
    completedAt: task.completedAt ? new Date(task.completedAt) : null,
    completionReasonCode: task.completionReasonCode,
    createReasonCode: task.createReasonCode,
    createdAt: new Date(task.createdAt),
    createdByBranchId: task.createdBy.branchId,
    createdById: task.createdBy.actorId,
    createdByRole: task.createdBy.role,
    dueAt: task.dueAt ? new Date(task.dueAt) : null,
    id: task.taskId,
    idempotencyKey: task.idempotencyKey,
    lifecycleVersion: task.lifecycleVersion,
    priority: task.priority,
    reopenedAt: task.reopenedAt ? new Date(task.reopenedAt) : null,
    reopenReasonCode: task.reopenReasonCode,
    status: task.status,
    subjectId: task.subjectReference.id,
    subjectKind: task.subjectReference.kind,
    tenantId: task.tenantId,
    updatedAt: new Date(task.updatedAt),
  };
}

export function historyRowFromTask(task: CrmTask) {
  const entry = task.history[0];
  if (!entry) throw new Error('missing history');
  return {
    actorBranchId: entry.actor.branchId,
    actorId: entry.actor.actorId,
    actorRole: entry.actor.role,
    createdAt: now,
    event: entry.event,
    fromStatus: entry.fromStatus,
    id: 'history-1',
    occurredAt: new Date(entry.timestamp),
    reasonCode: entry.reasonCode,
    taskId: task.taskId,
    tenantId: entry.actor.tenantId,
    toStatus: entry.toStatus,
  };
}

export function createFakeDb(options: {
  historyRows?: readonly unknown[];
  insertTaskError?: Error;
  leadRow?: unknown;
  taskRow?: unknown;
  updateRows?: readonly unknown[];
}) {
  const calls: unknown[] = [];
  const task = createTask();
  const taskRow = options.taskRow ?? rowFromTask(task);
  const historyRows = options.historyRows ?? [historyRowFromTask(task)];
  const leadRow = options.leadRow ?? {
    agentId: 'agent-1',
    branchId: 'branch-1',
    id: 'lead-1',
    tenantId: 'tenant-1',
  };
  const crmTaskFindFirst = vi.fn((): Promise<ReturnType<typeof rowFromTask> | null> =>
    Promise.resolve(null)
  );

  const query = {
    crmDeals: { findFirst: vi.fn(() => Promise.resolve(null)) },
    crmLeads: { findFirst: vi.fn(() => Promise.resolve(leadRow)) },
    crmTaskHistory: { findMany: vi.fn(() => Promise.resolve(historyRows)) },
    crmTasks: { findFirst: crmTaskFindFirst },
    supportHandoffs: { findFirst: vi.fn(() => Promise.resolve(null)) },
  };

  const tx = {
    insert(table: unknown) {
      calls.push({ action: 'insert', table });
      return {
        values(values: unknown) {
          calls.push({ action: 'values', table, values });
          return {
            returning: vi.fn(() => {
              if (table === crmTasks && options.insertTaskError) {
                return Promise.reject(options.insertTaskError);
              }
              return Promise.resolve(table === crmTasks ? [taskRow] : []);
            }),
          };
        },
      };
    },
    update(table: unknown) {
      calls.push({ action: 'update', table });
      return {
        set(values: unknown) {
          calls.push({ action: 'set', table, values });
          return {
            where(where: unknown) {
              calls.push({ action: 'where', table, where });
              return {
                returning: vi.fn(() => Promise.resolve(options.updateRows ?? [taskRow])),
              };
            },
          };
        },
      };
    },
  };

  return {
    calls,
    db: {
      query,
      transaction: vi.fn(
        async (callback: (transaction: typeof tx) => unknown) => await callback(tx)
      ),
    } as unknown as TaskRepositoryDb,
    query,
    task,
  };
}

export { hoisted };
