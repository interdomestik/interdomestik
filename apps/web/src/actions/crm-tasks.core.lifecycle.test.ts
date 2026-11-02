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

describe('CRM task core boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        lifecycleVersion: 2,
        priority: 'urgent',
        status: 'pending',
      },
      expectedTransition: {
        event: 'priority_updated',
        fromStatus: 'pending',
        reasonCode: 'manual_priority_change',
        toStatus: 'pending',
      },
      input: {
        expectedLifecycleVersion: 1,
        priority: 'urgent',
        reasonCode: 'manual_priority_change',
        taskId: 'task-1',
      },
      mutate: updateCrmTaskPriorityCore,
      name: 'priority update',
      sourceTask: task({ updatedAt: '2026-05-21T09:59:00.000Z' }),
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
      readonly authority: typeof TEST_AUTHORITY;
      readonly session: ReturnType<typeof session>;
    }) => ReturnType<typeof updateCrmTaskDueAtCore>;
    const result = await mutate({
      deps: d,
      input: scenario.input,
      authority: TEST_AUTHORITY,
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
});
