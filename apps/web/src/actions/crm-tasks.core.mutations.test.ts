import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEST_AUTHORITY,
  TEST_NOW,
  createInput,
  deps,
  repository,
  session,
  task,
} from './crm-tasks.core.test-support';
import { CrmTaskRepositoryFailure } from '@interdomestik/domain-crm/tasks';
import {
  assignCrmTaskCore,
  createCrmTaskCore,
  readCrmTaskCore,
  startCrmTaskCore,
  updateCrmTaskDueAtCore,
  updateCrmTaskPriorityCore,
} from './crm-tasks.core';

describe('CRM task core boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      authority: TEST_AUTHORITY,
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

  it.each([
    {
      input: { expectedLifecycleVersion: 1, reasonCode: 'manual_start', taskId: 'task-1' },
      mutate: startCrmTaskCore,
      name: 'lifecycle',
      sourceTask: task({ updatedAt: '2026-05-21T09:59:00.000Z' }),
    },
    {
      input: {
        dueAt: '2026-05-22T12:00:00.000Z',
        expectedLifecycleVersion: 1,
        reasonCode: 'due_date_changed',
        taskId: 'task-1',
      },
      mutate: updateCrmTaskDueAtCore,
      name: 'due-date lifecycle',
      sourceTask: task({
        dueAt: '2026-05-22T10:00:00.000Z',
        updatedAt: '2026-05-21T09:59:00.000Z',
      }),
    },
  ] as const)(
    'maps $name repository conflicts to conflict without audit or revalidation',
    async scenario => {
      const repo = repository({
        findTaskById: vi.fn().mockResolvedValue(scenario.sourceTask),
        saveTask: vi.fn().mockRejectedValue(new CrmTaskRepositoryFailure('lifecycle_conflict')),
      });
      const d = deps(repo);

      const mutate = scenario.mutate as (params: {
        readonly deps: typeof d;
        readonly input: typeof scenario.input;
        readonly authority: typeof TEST_AUTHORITY;
        readonly session: ReturnType<typeof session>;
      }) => ReturnType<typeof updateCrmTaskDueAtCore>;
      const result = await mutate({
        deps: d,
        input: scenario.input,
        authority: TEST_AUTHORITY,
        session: session(),
      });

      expect(result).toEqual({ outcome: 'conflict', reason: 'lifecycle_conflict' });
      expect(d.audit).not.toHaveBeenCalled();
      expect(d.revalidate).not.toHaveBeenCalled();
    }
  );

  it.each([
    {
      dueAt: 'not-a-date',
      expected: { outcome: 'invalid_input', reason: 'invalid_due_at' },
      name: 'rejects invalid due dates',
      sourceTask: task(),
    },
    {
      dueAt: '2026-05-22T12:00:00.000Z',
      expected: { outcome: 'conflict', reason: 'terminal_state' },
      name: 'maps terminal due-date updates to conflict',
      sourceTask: task({
        completedAt: TEST_NOW,
        completionReasonCode: 'resolved',
        status: 'completed',
      }),
    },
  ] as const)('$name without save, audit, or revalidation', async scenario => {
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(scenario.sourceTask),
    });
    const d = deps(repo);

    const result = await updateCrmTaskDueAtCore({
      deps: d,
      input: {
        dueAt: scenario.dueAt,
        expectedLifecycleVersion: 1,
        reasonCode: 'due_date_changed',
        taskId: 'task-1',
      },
      authority: TEST_AUTHORITY,
      session: session(),
    });

    expect(result).toEqual(scenario.expected);
    expect(repo.saveTask).not.toHaveBeenCalled();
    expect(d.audit).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    {
      expected: { outcome: 'invalid_input', reason: 'invalid_priority' },
      input: {
        expectedLifecycleVersion: 1,
        priority: 'unsupported',
        reasonCode: 'manual_priority_change',
        taskId: 'task-1',
      },
      name: 'rejects invalid priority values',
      sourceTask: task(),
    },
    {
      expected: { outcome: 'invalid_input', reason: 'invalid_reason_code' },
      input: {
        expectedLifecycleVersion: 1,
        priority: 'urgent',
        reasonCode: 'unsupported_reason',
        taskId: 'task-1',
      },
      name: 'rejects invalid priority reason values',
      sourceTask: task(),
    },
    {
      expected: { outcome: 'conflict', reason: 'terminal_state' },
      input: {
        expectedLifecycleVersion: 1,
        priority: 'urgent',
        reasonCode: 'manual_priority_change',
        taskId: 'task-1',
      },
      name: 'maps terminal priority updates to conflict',
      sourceTask: task({
        completedAt: TEST_NOW,
        completionReasonCode: 'resolved',
        status: 'completed',
      }),
    },
  ] as const)('$name without save, audit, or revalidation', async scenario => {
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(scenario.sourceTask),
    });
    const d = deps(repo);

    const result = await updateCrmTaskPriorityCore({
      deps: d,
      input: scenario.input as never,
      authority: TEST_AUTHORITY,
      session: session(),
    });

    expect(result).toEqual(scenario.expected);
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
        authority: TEST_AUTHORITY,
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
      authority: TEST_AUTHORITY,
      session: session(),
    });

    expect(result.outcome).toBe('success');
    expect(repo.saveTask).toHaveBeenCalledWith({
      actor: expect.objectContaining({ actorId: 'agent-1', tenantId: 'tenant-1' }),
      expectedLifecycleVersion: 1,
      task: expect.objectContaining({ lifecycleVersion: 2, status: 'pending' }),
    });
  });
});
