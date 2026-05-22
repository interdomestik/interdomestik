import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/adapters/crm/task-repository', () => ({
  crmTaskRepository: {},
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'task-1',
}));

import {
  CrmTaskRepositoryFailure,
  type CrmTask,
  type CrmTaskRepository,
} from '@interdomestik/domain-crm/tasks';

import {
  assignCrmTaskCore,
  cancelCrmTaskCore,
  completeCrmTaskCore,
  createCrmTaskCore,
  readCrmTaskCore,
  reopenCrmTaskCore,
  startCrmTaskCore,
  updateCrmTaskDueAtCore,
} from './crm-tasks.core';

const TEST_NOW = '2026-05-21T10:00:00.000Z';
const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      branchId: 'branch-1',
      id: 'agent-1',
      role: 'agent',
      tenantId: 'tenant-1',
      ...overrides,
    },
  };
}

function task(overrides: Partial<CrmTask> = {}): CrmTask {
  return {
    assignedTo: { kind: 'unassigned' },
    branchId: 'branch-1',
    cancelledAt: null,
    cancellationReasonCode: null,
    completedAt: null,
    completionReasonCode: null,
    createReasonCode: 'manual',
    createdAt: TEST_NOW,
    createdBy: {
      actorId: 'agent-1',
      branchId: 'branch-1',
      role: 'agent',
      tenantId: 'tenant-1',
    },
    dueAt: null,
    history: [
      {
        actor: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        event: 'created',
        fromStatus: null,
        reasonCode: 'manual',
        timestamp: TEST_NOW,
        toStatus: 'pending',
      },
    ],
    idempotencyKey: 'idem-1',
    lifecycleVersion: 1,
    priority: 'normal',
    reopenedAt: null,
    reopenReasonCode: null,
    status: 'pending',
    subjectReference: { id: 'lead-1', kind: 'lead' },
    taskId: 'task-1',
    tenantId: 'tenant-1',
    updatedAt: TEST_NOW,
    ...overrides,
  };
}

function repository(overrides: Partial<CrmTaskRepository> = {}) {
  return {
    appendTaskHistory: vi.fn(),
    findTaskById: vi.fn(),
    findTaskByIdempotencyKey: vi.fn().mockResolvedValue(null),
    saveTask: vi.fn(async ({ task: saved }) => saved),
    validateSubjectReference: vi.fn().mockResolvedValue({
      branchId: 'branch-1',
      tenantId: 'tenant-1',
      visible: true,
    }),
    ...overrides,
  } satisfies CrmTaskRepository;
}

function deps(repo = repository()) {
  return {
    audit: vi.fn().mockResolvedValue(undefined),
    now: () => TEST_NOW,
    rateLimit: vi.fn().mockResolvedValue({ limited: false }),
    repository: repo,
    revalidate: vi.fn(),
    taskId: () => 'task-1',
  };
}

function createInput() {
  return {
    assignedTo: { kind: 'unassigned' } as const,
    createReasonCode: 'manual' as const,
    idempotencyKey: 'idem-1',
    priority: 'normal' as const,
    subjectReference: { id: 'lead-1', kind: 'lead' as const },
    taskId: 'task-1',
  };
}

describe('CRM task core boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed for missing sessions before repository access', async () => {
    const repo = repository();
    const d = deps(repo);

    const result = await readCrmTaskCore({
      deps: d,
      session: null,
      taskId: 'task-1',
    });

    expect(result).toEqual({ outcome: 'unauthorized', reason: 'missing_session' });
    expect(repo.findTaskById).not.toHaveBeenCalled();
    expect(d.rateLimit).not.toHaveBeenCalled();
  });

  it('maps member task mutations to forbidden role scope', async () => {
    const repo = repository();
    const d = deps(repo);

    const result = await createCrmTaskCore({
      deps: d,
      input: createInput(),
      requestHeaders: new Headers({ 'user-agent': 'Vitest' }),
      session: session({ role: 'member' }),
    });

    expect(result).toEqual({ outcome: 'forbidden', reason: 'role_scope' });
    expect(d.rateLimit).not.toHaveBeenCalled();
    expect(repo.validateSubjectReference).not.toHaveBeenCalled();
    expect(repo.saveTask).not.toHaveBeenCalled();
    expect(d.audit).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it('creates a task with subject proof, audit metadata, and locale CRM revalidation', async () => {
    const repo = repository();
    const d = deps(repo);

    const result = await createCrmTaskCore({
      deps: d,
      input: createInput(),
      requestHeaders: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
      session: session(),
    });

    expect(result.outcome).toBe('success');
    expect(repo.validateSubjectReference).toHaveBeenCalledWith({
      actor: expect.objectContaining({
        actorId: 'agent-1',
        role: 'agent',
        scope: expect.objectContaining({ branchId: 'branch-1' }),
        tenantId: 'tenant-1',
      }),
      subjectReference: { id: 'lead-1', kind: 'lead' },
    });
    expect(repo.saveTask).toHaveBeenCalledWith({
      actor: expect.objectContaining({ actorId: 'agent-1', tenantId: 'tenant-1' }),
      task: expect.objectContaining({
        branchId: 'branch-1',
        idempotencyKey: 'idem-1',
        subjectReference: { id: 'lead-1', kind: 'lead' },
      }),
    });
    expect(d.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'crm.task.created',
        actorId: 'agent-1',
        actorRole: 'agent',
        entityId: 'task-1',
        entityType: 'crm_task',
        metadata: {
          event: 'created',
          fromStatus: null,
          operation: 'created',
          reasonCode: 'manual',
          replay: false,
          subjectKind: 'lead',
          toStatus: 'pending',
        },
        tenantId: 'tenant-1',
      })
    );
    for (const locale of LOCALES) {
      expect(d.revalidate).toHaveBeenCalledWith(`/${locale}/agent/crm`);
      expect(d.revalidate).toHaveBeenCalledWith(`/${locale}/staff/crm`);
      expect(d.revalidate).toHaveBeenCalledWith(`/${locale}/admin/crm`);
    }
    expect(JSON.stringify(vi.mocked(d.audit).mock.calls)).not.toContain('Sensitive lead note');
  });

  it('returns idempotent replay for an equivalent create without saving or revalidating', async () => {
    const existing = task();
    const repo = repository({
      findTaskByIdempotencyKey: vi.fn().mockResolvedValue(existing),
    });
    const d = deps(repo);

    const result = await createCrmTaskCore({
      deps: d,
      input: createInput(),
      session: session(),
    });

    expect(result).toEqual({
      outcome: 'idempotent_replay',
      reason: 'idempotent_replay',
      task: existing,
    });
    expect(repo.saveTask).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
    expect(d.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'crm.task.created',
        metadata: expect.objectContaining({
          fromStatus: null,
          reasonCode: 'manual',
          replay: true,
          toStatus: 'pending',
        }),
      })
    );
  });

  it.each(['tenant_admin', 'super_admin'] as const)(
    'normalizes %s sessions to the admin CRM actor for reads',
    async role => {
      const existing = task({ branchId: 'branch-2' });
      const repo = repository({
        findTaskById: vi.fn().mockResolvedValue(existing),
      });

      const result = await readCrmTaskCore({
        deps: deps(repo),
        session: session({ branchId: null, role }),
        taskId: 'task-1',
      });

      expect(result).toEqual({ outcome: 'success', task: existing });
      expect(repo.findTaskById).toHaveBeenCalledWith({
        actor: expect.objectContaining({
          actorId: 'agent-1',
          role: 'admin',
          scope: expect.objectContaining({ branchId: null, staffId: 'agent-1' }),
          tenantId: 'tenant-1',
        }),
        taskId: 'task-1',
      });
    }
  );

  it('normalizes tenant_admin sessions to the admin CRM actor for mutations', async () => {
    const existing = task({ branchId: 'branch-2', updatedAt: '2026-05-21T09:59:00.000Z' });
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(existing),
    });
    const d = deps(repo);

    const result = await updateCrmTaskDueAtCore({
      deps: d,
      input: {
        dueAt: '2026-05-22T10:00:00.000Z',
        expectedLifecycleVersion: 1,
        reasonCode: 'due_date_changed',
        taskId: 'task-1',
      },
      session: session({ branchId: null, role: 'tenant_admin' }),
    });

    expect(result.outcome).toBe('success');
    expect(repo.saveTask).toHaveBeenCalledWith({
      actor: expect.objectContaining({
        actorId: 'agent-1',
        role: 'admin',
        scope: expect.objectContaining({ branchId: null, staffId: 'agent-1' }),
        tenantId: 'tenant-1',
      }),
      expectedLifecycleVersion: 1,
      task: expect.objectContaining({
        dueAt: '2026-05-22T10:00:00.000Z',
        lifecycleVersion: 2,
      }),
    });
  });

  it('short-circuits rate-limited mutations before repository writes', async () => {
    const repo = repository();
    const d = deps(repo);
    d.rateLimit.mockResolvedValue({
      error: 'Too many requests',
      limited: true,
      retryAfter: 42,
      status: 429,
    });

    const result = await createCrmTaskCore({
      deps: d,
      input: createInput(),
      session: session(),
    });

    expect(result).toEqual({
      outcome: 'rate_limited',
      reason: 'rate_limited',
      retryAfter: 42,
    });
    expect(repo.validateSubjectReference).not.toHaveBeenCalled();
    expect(repo.saveTask).not.toHaveBeenCalled();
    expect(d.audit).not.toHaveBeenCalled();
  });

  it('maps lifecycle repository conflicts to conflict without audit or revalidation', async () => {
    const existing = task({ updatedAt: '2026-05-21T09:59:00.000Z' });
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(existing),
      saveTask: vi.fn().mockRejectedValue(new CrmTaskRepositoryFailure('lifecycle_conflict')),
    });
    const d = deps(repo);

    const result = await startCrmTaskCore({
      deps: d,
      input: { expectedLifecycleVersion: 1, reasonCode: 'manual_start', taskId: 'task-1' },
      session: session(),
    });

    expect(result).toEqual({ outcome: 'conflict', reason: 'lifecycle_conflict' });
    expect(d.audit).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it('maps due-date lifecycle repository conflicts to conflict without audit or revalidation', async () => {
    const existing = task({
      dueAt: '2026-05-22T10:00:00.000Z',
      updatedAt: '2026-05-21T09:59:00.000Z',
    });
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(existing),
      saveTask: vi.fn().mockRejectedValue(new CrmTaskRepositoryFailure('lifecycle_conflict')),
    });
    const d = deps(repo);

    const result = await updateCrmTaskDueAtCore({
      deps: d,
      input: {
        dueAt: '2026-05-22T12:00:00.000Z',
        expectedLifecycleVersion: 1,
        reasonCode: 'due_date_changed',
        taskId: 'task-1',
      },
      session: session(),
    });

    expect(result).toEqual({ outcome: 'conflict', reason: 'lifecycle_conflict' });
    expect(d.audit).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it('rejects invalid due dates without save, audit, or revalidation', async () => {
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(task()),
    });
    const d = deps(repo);

    const result = await updateCrmTaskDueAtCore({
      deps: d,
      input: {
        dueAt: 'not-a-date',
        expectedLifecycleVersion: 1,
        reasonCode: 'due_date_changed',
        taskId: 'task-1',
      },
      session: session(),
    });

    expect(result).toEqual({ outcome: 'invalid_input', reason: 'invalid_due_at' });
    expect(repo.saveTask).not.toHaveBeenCalled();
    expect(d.audit).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it('maps terminal due-date updates to conflict without save, audit, or revalidation', async () => {
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(
        task({
          completedAt: TEST_NOW,
          completionReasonCode: 'resolved',
          status: 'completed',
        })
      ),
    });
    const d = deps(repo);

    const result = await updateCrmTaskDueAtCore({
      deps: d,
      input: {
        dueAt: '2026-05-22T12:00:00.000Z',
        expectedLifecycleVersion: 1,
        reasonCode: 'due_date_changed',
        taskId: 'task-1',
      },
      session: session(),
    });

    expect(result).toEqual({ outcome: 'conflict', reason: 'terminal_state' });
    expect(repo.saveTask).not.toHaveBeenCalled();
    expect(d.audit).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it('maps absent scoped reads to not_found', async () => {
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(null),
    });

    await expect(
      readCrmTaskCore({
        deps: deps(repo),
        session: session(),
        taskId: 'task-1',
      })
    ).resolves.toEqual({ outcome: 'not_found', reason: 'task_not_found' });
  });

  it('saves assignment mutations with the expected lifecycle version', async () => {
    const existing = task({ updatedAt: '2026-05-21T09:59:00.000Z' });
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(existing),
    });
    const d = deps(repo);

    const result = await assignCrmTaskCore({
      deps: d,
      input: {
        assignedTo: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          kind: 'actor',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        expectedLifecycleVersion: 1,
        reasonCode: 'manual_assignment',
        taskId: 'task-1',
      },
      session: session(),
    });

    expect(result.outcome).toBe('success');
    expect(repo.saveTask).toHaveBeenCalledWith({
      actor: expect.objectContaining({ actorId: 'agent-1', tenantId: 'tenant-1' }),
      expectedLifecycleVersion: 1,
      task: expect.objectContaining({ lifecycleVersion: 2, status: 'pending' }),
    });
  });

  it.each([
    {
      expectedTask: {
        dueAt: '2026-05-22T10:00:00.000Z',
        lifecycleVersion: 2,
        status: 'pending',
      },
      expectedTransition: {
        event: 'due_updated',
        fromStatus: 'pending',
        reasonCode: 'due_date_changed',
        toStatus: 'pending',
      },
      input: {
        dueAt: '2026-05-22T10:00:00.000Z',
        expectedLifecycleVersion: 7,
        reasonCode: 'due_date_changed',
        taskId: 'task-1',
      },
      mutate: updateCrmTaskDueAtCore,
      name: 'due date updates',
      sourceTask: task({ updatedAt: '2026-05-21T09:59:00.000Z' }),
    },
    {
      expectedTask: {
        dueAt: null,
        lifecycleVersion: 3,
        status: 'pending',
      },
      expectedTransition: {
        event: 'due_updated',
        fromStatus: 'pending',
        reasonCode: 'due_date_cleared',
        toStatus: 'pending',
      },
      input: {
        dueAt: null,
        expectedLifecycleVersion: 2,
        reasonCode: 'due_date_cleared',
        taskId: 'task-1',
      },
      mutate: updateCrmTaskDueAtCore,
      name: 'due date clearing',
      sourceTask: task({
        dueAt: '2026-05-22T10:00:00.000Z',
        lifecycleVersion: 2,
        updatedAt: '2026-05-21T09:59:00.000Z',
      }),
    },
    {
      expectedTask: {
        completedAt: TEST_NOW,
        completionReasonCode: 'resolved',
        lifecycleVersion: 4,
        status: 'completed',
      },
      expectedTransition: {
        event: 'completed',
        fromStatus: 'in_progress',
        reasonCode: 'resolved',
        toStatus: 'completed',
      },
      input: {
        expectedLifecycleVersion: 3,
        reasonCode: 'resolved',
        taskId: 'task-1',
      },
      mutate: completeCrmTaskCore,
      name: 'completion',
      sourceTask: task({
        lifecycleVersion: 3,
        status: 'in_progress',
        updatedAt: '2026-05-21T09:59:00.000Z',
      }),
    },
    {
      expectedTask: {
        cancellationReasonCode: 'created_in_error',
        cancelledAt: TEST_NOW,
        lifecycleVersion: 6,
        status: 'cancelled',
      },
      expectedTransition: {
        event: 'cancelled',
        fromStatus: 'pending',
        reasonCode: 'created_in_error',
        toStatus: 'cancelled',
      },
      input: {
        expectedLifecycleVersion: 5,
        reasonCode: 'created_in_error',
        taskId: 'task-1',
      },
      mutate: cancelCrmTaskCore,
      name: 'cancellation',
      sourceTask: task({
        lifecycleVersion: 5,
        updatedAt: '2026-05-21T09:59:00.000Z',
      }),
    },
    {
      expectedTask: {
        completedAt: null,
        completionReasonCode: null,
        lifecycleVersion: 10,
        reopenedAt: TEST_NOW,
        reopenReasonCode: 'follow_up_required',
        status: 'in_progress',
      },
      expectedTransition: {
        event: 'reopened',
        fromStatus: 'completed',
        reasonCode: 'follow_up_required',
        toStatus: 'in_progress',
      },
      input: {
        expectedLifecycleVersion: 9,
        reasonCode: 'follow_up_required',
        taskId: 'task-1',
      },
      mutate: reopenCrmTaskCore,
      name: 'reopen',
      sourceTask: task({
        completedAt: '2026-05-21T09:30:00.000Z',
        completionReasonCode: 'resolved',
        lifecycleVersion: 9,
        status: 'completed',
        updatedAt: '2026-05-21T09:59:00.000Z',
      }),
    },
  ] as const)('persists expected lifecycle version and transition for $name', async scenario => {
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(scenario.sourceTask),
    });
    const d = deps(repo);

    const mutate = scenario.mutate as (params: {
      readonly deps: typeof d;
      readonly input: typeof scenario.input;
      readonly session: ReturnType<typeof session>;
    }) => ReturnType<typeof updateCrmTaskDueAtCore>;
    const result = await mutate({
      deps: d,
      input: scenario.input,
      session: session(),
    });

    expect(result).toMatchObject({
      outcome: 'success',
      transition: scenario.expectedTransition,
    });
    expect(repo.saveTask).toHaveBeenCalledWith({
      actor: expect.objectContaining({ actorId: 'agent-1', tenantId: 'tenant-1' }),
      expectedLifecycleVersion: scenario.input.expectedLifecycleVersion,
      task: expect.objectContaining(scenario.expectedTask),
    });
    expect(d.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: `crm.task.${scenario.expectedTransition.event}`,
        metadata: expect.objectContaining({
          event: scenario.expectedTransition.event,
          fromStatus: scenario.expectedTransition.fromStatus,
          operation: scenario.expectedTransition.event,
          reasonCode: scenario.expectedTransition.reasonCode,
          replay: false,
          toStatus: scenario.expectedTransition.toStatus,
        }),
      })
    );
  });

  it.each([
    {
      existingTask: task({
        dueAt: null,
        updatedAt: '2026-05-21T09:59:00.000Z',
      }),
      expectedEvent: 'due_updated',
      expectedFromStatus: null,
      input: {
        dueAt: null,
        expectedLifecycleVersion: 1,
        reasonCode: 'due_date_cleared',
        taskId: 'task-1',
      },
      mutate: updateCrmTaskDueAtCore,
      name: 'cleared due date updates',
    },
    {
      existingTask: task({
        dueAt: '2026-05-22T10:00:00.000Z',
        updatedAt: '2026-05-21T09:59:00.000Z',
      }),
      expectedEvent: 'due_updated',
      expectedFromStatus: null,
      input: {
        dueAt: '2026-05-22T10:00:00.000Z',
        expectedLifecycleVersion: 1,
        reasonCode: 'due_date_changed',
        taskId: 'task-1',
      },
      mutate: updateCrmTaskDueAtCore,
      name: 'due date updates',
    },
    {
      existingTask: task({
        completedAt: TEST_NOW,
        completionReasonCode: 'resolved',
        status: 'completed',
        updatedAt: '2026-05-21T09:59:00.000Z',
      }),
      expectedEvent: 'completed',
      expectedFromStatus: null,
      input: {
        expectedLifecycleVersion: 1,
        reasonCode: 'resolved',
        taskId: 'task-1',
      },
      mutate: completeCrmTaskCore,
      name: 'completion',
    },
    {
      existingTask: task({
        cancellationReasonCode: 'created_in_error',
        cancelledAt: TEST_NOW,
        status: 'cancelled',
        updatedAt: '2026-05-21T09:59:00.000Z',
      }),
      expectedEvent: 'cancelled',
      expectedFromStatus: null,
      input: {
        expectedLifecycleVersion: 1,
        reasonCode: 'created_in_error',
        taskId: 'task-1',
      },
      mutate: cancelCrmTaskCore,
      name: 'cancellation',
    },
  ] as const)('audits $name idempotent replays with fallback events', async scenario => {
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(scenario.existingTask),
    });
    const d = deps(repo);

    const mutate = scenario.mutate as (params: {
      readonly deps: typeof d;
      readonly input: typeof scenario.input;
      readonly session: ReturnType<typeof session>;
    }) => ReturnType<typeof updateCrmTaskDueAtCore>;
    const result = await mutate({
      deps: d,
      input: scenario.input,
      session: session(),
    });

    expect(result).toEqual({
      outcome: 'idempotent_replay',
      reason: 'idempotent_replay',
      task: scenario.existingTask,
    });
    expect(repo.saveTask).not.toHaveBeenCalled();
    expect(d.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: `crm.task.${scenario.expectedEvent}`,
        metadata: expect.objectContaining({
          event: scenario.expectedEvent,
          fromStatus: scenario.expectedFromStatus,
          operation: scenario.expectedEvent,
          reasonCode: null,
          replay: true,
          toStatus: scenario.existingTask.status,
        }),
      })
    );
  });
});
