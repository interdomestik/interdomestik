import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEST_AUTHORITY,
  TEST_NOW,
  deps,
  repository,
  session,
  task,
} from './crm-tasks.core.test-support';
import {
  cancelCrmTaskCore,
  completeCrmTaskCore,
  reopenCrmTaskCore,
  updateCrmTaskDueAtCore,
  updateCrmTaskPriorityCore,
} from './crm-tasks.core';

type QueueGuardOutcome = {
  readonly deps: ReturnType<typeof deps>;
  readonly guard: ReturnType<typeof vi.fn>;
  readonly reason: string;
  readonly repo: ReturnType<typeof repository>;
  readonly result: unknown;
};

// The queue guard sees the agent actor and the expected version, and refuses before any task read.
function expectGuardRefusedBeforeLoad({
  deps: d,
  guard,
  reason,
  repo,
  result,
}: QueueGuardOutcome): void {
  expect(result).toEqual({
    outcome: 'forbidden',
    reason,
  });
  expect(guard).toHaveBeenCalledWith({
    actor: expect.objectContaining({
      actorId: 'agent-1',
      role: 'agent',
      tenantId: 'tenant-1',
    }),
    authority: expect.anything(),
    deps: d,
    input: expect.objectContaining({
      expectedLifecycleVersion: 9,
      taskId: 'task-1',
    }),
    requestHeaders: expect.any(Headers),
  });
  expect(guard.mock.calls[0][0].authority).toBe(TEST_AUTHORITY);
  expect(repo.findTaskById).not.toHaveBeenCalled();
  expect(repo.saveTask).not.toHaveBeenCalled();
}

describe('CRM task core boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the open-queue guard before priority updates', async () => {
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(
        task({
          lifecycleVersion: 9,
          priority: 'normal',
        })
      ),
    });
    const d = deps(repo);
    const guard = vi.fn().mockResolvedValue({
      outcome: 'forbidden',
      reason: 'task_not_in_queue',
    });

    const result = await updateCrmTaskPriorityCore({
      deps: d,
      guard,
      input: {
        expectedLifecycleVersion: 9,
        priority: 'urgent',
        reasonCode: 'manual_priority_change',
        taskId: 'task-1',
      },
      authority: TEST_AUTHORITY,
      session: session(),
    });

    expectGuardRefusedBeforeLoad({ deps: d, guard, reason: 'task_not_in_queue', repo, result });
  });

  it('runs the completed-queue guard before reopening a task', async () => {
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(
        task({
          completedAt: '2026-05-21T09:30:00.000Z',
          completionReasonCode: 'resolved',
          lifecycleVersion: 9,
          status: 'completed',
        })
      ),
    });
    const d = deps(repo);
    const guard = vi.fn().mockResolvedValue({
      outcome: 'forbidden',
      reason: 'task_not_in_completed_queue',
    });

    const result = await reopenCrmTaskCore({
      deps: d,
      guard,
      input: {
        expectedLifecycleVersion: 9,
        reasonCode: 'follow_up_required',
        taskId: 'task-1',
      },
      authority: TEST_AUTHORITY,
      session: session(),
    });

    expectGuardRefusedBeforeLoad({
      deps: d,
      guard,
      reason: 'task_not_in_completed_queue',
      repo,
      result,
    });
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
        priority: 'urgent',
        updatedAt: '2026-05-21T09:59:00.000Z',
      }),
      expectedEvent: 'priority_updated',
      expectedFromStatus: null,
      input: {
        expectedLifecycleVersion: 1,
        priority: 'urgent',
        reasonCode: 'manual_priority_change',
        taskId: 'task-1',
      },
      mutate: updateCrmTaskPriorityCore,
      name: 'priority updates',
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
      readonly authority: typeof TEST_AUTHORITY;
      readonly session: ReturnType<typeof session>;
    }) => ReturnType<typeof updateCrmTaskDueAtCore>;
    const result = await mutate({
      deps: d,
      input: scenario.input,
      authority: TEST_AUTHORITY,
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
