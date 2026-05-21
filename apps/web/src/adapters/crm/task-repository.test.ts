import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  db: {},
}));

vi.mock('@interdomestik/database/db', () => ({
  db: hoisted.db,
}));

import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import {
  createCrmTask,
  CrmTaskRepositoryFailure,
  type CrmTask,
} from '@interdomestik/domain-crm/tasks';
import { crmTaskHistory, crmTasks } from '@interdomestik/database/schema';

import { createCrmTaskRepository } from './task-repository';

type TaskRepositoryDb = NonNullable<Parameters<typeof createCrmTaskRepository>[0]>;

const now = new Date('2026-05-21T08:00:00.000Z');

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function createTask(): CrmTask {
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

function rowFromTask(task: CrmTask) {
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

function historyRowFromTask(task: CrmTask) {
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

function createFakeDb(options: {
  historyRows?: readonly unknown[];
  insertTaskError?: unknown;
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
  const crmTaskFindFirst = vi.fn(async (): Promise<ReturnType<typeof rowFromTask> | null> => null);

  const query = {
    crmDeals: { findFirst: vi.fn(async () => null) },
    crmLeads: { findFirst: vi.fn(async () => leadRow) },
    crmTaskHistory: { findMany: vi.fn(async () => historyRows) },
    crmTasks: { findFirst: crmTaskFindFirst },
    supportHandoffs: { findFirst: vi.fn(async () => null) },
  };

  const tx = {
    insert(table: unknown) {
      calls.push({ action: 'insert', table });
      return {
        values(values: unknown) {
          calls.push({ action: 'values', table, values });
          return {
            returning: vi.fn(async () => {
              if (table === crmTasks && options.insertTaskError) throw options.insertTaskError;
              return table === crmTasks ? [taskRow] : [];
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
                returning: vi.fn(async () => options.updateRows ?? [taskRow]),
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
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    } as unknown as TaskRepositoryDb,
    query,
    task,
  };
}

describe('crmTaskRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a CRM task and initial history row in one transaction without raw subject text', async () => {
    const fake = createFakeDb({});
    const repository = createCrmTaskRepository(fake.db);

    const saved = await repository.saveTask({ actor: agentActor, task: fake.task });

    expect(saved).toMatchObject({
      branchId: 'branch-1',
      idempotencyKey: 'crm25-task-create',
      lifecycleVersion: 1,
      status: 'pending',
      subjectReference: { id: 'lead-1', kind: 'lead' },
      taskId: 'task-1',
      tenantId: 'tenant-1',
    });
    expect(fake.db.transaction).toHaveBeenCalledOnce();
    const persistedValues = fake.calls
      .filter((call): call is { values: unknown } => {
        return typeof call === 'object' && call !== null && 'values' in call;
      })
      .map(call => call.values);
    expect(JSON.stringify(persistedValues)).not.toContain('medical diagnosis');
    expect(fake.calls).toEqual([
      { action: 'insert', table: crmTasks },
      expect.objectContaining({
        action: 'values',
        table: crmTasks,
      }),
      { action: 'insert', table: crmTaskHistory },
      expect.objectContaining({
        action: 'values',
        table: crmTaskHistory,
      }),
    ]);
  });

  it('throws a deterministic conflict and skips history append on stale lifecycle writes', async () => {
    const fake = createFakeDb({ updateRows: [] });
    const repository = createCrmTaskRepository(fake.db);

    await expect(
      repository.saveTask({
        actor: agentActor,
        expectedLifecycleVersion: 1,
        task: { ...fake.task, lifecycleVersion: 2, updatedAt: '2026-05-21T09:00:00.000Z' },
      })
    ).rejects.toMatchObject({ reason: 'lifecycle_conflict' });

    expect(fake.calls).toEqual([
      { action: 'update', table: crmTasks },
      expect.objectContaining({ action: 'set', table: crmTasks }),
      expect.objectContaining({ action: 'where', table: crmTasks }),
    ]);
  });

  it('does not append history when the task subject is not visible to the actor', async () => {
    const fake = createFakeDb({
      leadRow: { agentId: 'agent-2', branchId: 'branch-1', id: 'lead-1', tenantId: 'tenant-1' },
    });
    fake.query.crmTasks.findFirst.mockResolvedValueOnce(rowFromTask(fake.task));
    const repository = createCrmTaskRepository(fake.db);

    await expect(
      repository.appendTaskHistory({
        actor: agentActor,
        entry: fake.task.history[0],
        expectedLifecycleVersion: 1,
        taskId: fake.task.taskId,
      })
    ).rejects.toMatchObject({ reason: 'subject_not_visible' });

    expect(fake.db.transaction).not.toHaveBeenCalled();
    expect(fake.calls).toEqual([]);
  });

  it('replays equivalent idempotent creates and rejects non-equivalent material', async () => {
    const fake = createFakeDb({});
    fake.query.crmTasks.findFirst.mockResolvedValueOnce(rowFromTask(fake.task));
    const repository = createCrmTaskRepository(fake.db);

    await expect(
      repository.saveTask({ actor: agentActor, task: fake.task })
    ).resolves.toMatchObject({
      idempotencyKey: 'crm25-task-create',
      taskId: 'task-1',
    });
    expect(fake.db.transaction).not.toHaveBeenCalled();

    fake.query.crmTasks.findFirst.mockResolvedValueOnce(rowFromTask(fake.task));
    await expect(
      repository.saveTask({
        actor: agentActor,
        task: { ...fake.task, priority: 'urgent' },
      })
    ).rejects.toMatchObject({ reason: 'idempotency_conflict' });
  });

  it('replays equivalent idempotent creates after concurrent unique-key races', async () => {
    const fake = createFakeDb({
      insertTaskError: Object.assign(new Error('duplicate key value'), {
        code: '23505',
        constraint: 'crm_tasks_tenant_idempotency_uq',
      }),
    });
    fake.query.crmTasks.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(rowFromTask(fake.task));
    const repository = createCrmTaskRepository(fake.db);

    await expect(
      repository.saveTask({ actor: agentActor, task: fake.task })
    ).resolves.toMatchObject({
      idempotencyKey: 'crm25-task-create',
      taskId: 'task-1',
    });

    expect(fake.db.transaction).toHaveBeenCalledOnce();
    expect(fake.query.crmTasks.findFirst).toHaveBeenCalledTimes(2);
  });

  it('fails closed for unsupported account/contact subjects and agent-invisible leads', async () => {
    const invisibleLead = createFakeDb({
      leadRow: { agentId: 'agent-2', branchId: 'branch-1', id: 'lead-1', tenantId: 'tenant-1' },
    });
    const repository = createCrmTaskRepository(invisibleLead.db);

    await expect(
      repository.validateSubjectReference?.({
        actor: agentActor,
        subjectReference: { id: 'lead-1', kind: 'lead' },
      })
    ).resolves.toEqual({ reason: 'subject_not_visible', visible: false });

    await expect(
      repository.validateSubjectReference?.({
        actor: agentActor,
        subjectReference: { id: 'account-1', kind: 'account' },
      })
    ).resolves.toEqual({ reason: 'subject_proof_missing', visible: false });
  });

  it('surfaces repository failures with stable reason codes', () => {
    expect(new CrmTaskRepositoryFailure('lifecycle_conflict')).toMatchObject({
      name: 'CrmTaskRepositoryFailure',
      reason: 'lifecycle_conflict',
    });
  });
});
