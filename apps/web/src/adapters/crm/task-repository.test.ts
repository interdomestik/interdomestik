import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onCrmTenantDatabase } from './crm-tenant-database.test-support';
import { agentActor, createFakeDb, rowFromTask } from './task-repository.test-support';
import { CrmTaskRepositoryFailure } from '@interdomestik/domain-crm/tasks';
import { crmTaskHistory, crmTasks } from '@interdomestik/database/schema';
import { createCrmTaskRepository } from './task-repository';

describe('crmTaskRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a CRM task and initial history row in one transaction without raw subject text', async () => {
    const fake = createFakeDb({});
    const repository = onCrmTenantDatabase(
      fake.db,
      createCrmTaskRepository(mintTestTenantAuthority('tenant-1'))
    );

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
    const repository = onCrmTenantDatabase(
      fake.db,
      createCrmTaskRepository(mintTestTenantAuthority('tenant-1'))
    );

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
    const repository = onCrmTenantDatabase(
      fake.db,
      createCrmTaskRepository(mintTestTenantAuthority('tenant-1'))
    );

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
    const repository = onCrmTenantDatabase(
      fake.db,
      createCrmTaskRepository(mintTestTenantAuthority('tenant-1'))
    );

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
    const repository = onCrmTenantDatabase(
      fake.db,
      createCrmTaskRepository(mintTestTenantAuthority('tenant-1'))
    );

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
    const repository = onCrmTenantDatabase(
      invisibleLead.db,
      createCrmTaskRepository(mintTestTenantAuthority('tenant-1'))
    );

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
