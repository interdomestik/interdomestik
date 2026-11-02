import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hoisted,
  mockPriorityActionWithQueueGuard,
  mockVisibleAgentTaskQueue,
  submitQueuePriority,
} from './task-queue-actions.test-support';
import { submitAgentCrmTaskQueueDueDateAction } from './task-queue-actions';

describe('submitAgentCrmTaskQueueDueDateAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.updateCrmTaskDueAtActionMock.mockResolvedValue({ outcome: 'success' });
  });

  it('sets a due date with the fixed due_date_changed reason code', async () => {
    const result = await submitAgentCrmTaskQueueDueDateAction({
      dueAt: '2026-05-22T10:00:00.000Z',
      expectedLifecycleVersion: 3,
      taskId: 'task-1',
    });

    expect(result).toEqual({ dueAt: '2026-05-22T10:00:00.000Z', success: true });
    expect(hoisted.updateCrmTaskDueAtActionMock).toHaveBeenCalledWith({
      dueAt: '2026-05-22T10:00:00.000Z',
      expectedLifecycleVersion: 3,
      reasonCode: 'due_date_changed',
      taskId: 'task-1',
    });
  });

  it('clears a due date with the fixed due_date_cleared reason code', async () => {
    const result = await submitAgentCrmTaskQueueDueDateAction({
      dueAt: null,
      expectedLifecycleVersion: 4,
      taskId: 'task-2',
    });

    expect(result).toEqual({ dueAt: null, success: true });
    expect(hoisted.updateCrmTaskDueAtActionMock).toHaveBeenCalledWith({
      dueAt: null,
      expectedLifecycleVersion: 4,
      reasonCode: 'due_date_cleared',
      taskId: 'task-2',
    });
  });

  it('treats same-value idempotency as success', async () => {
    hoisted.updateCrmTaskDueAtActionMock.mockResolvedValueOnce({
      outcome: 'idempotent_replay',
      reason: 'idempotent_replay',
    });

    const result = await submitAgentCrmTaskQueueDueDateAction({
      dueAt: '2026-05-22T10:00:00.000Z',
      expectedLifecycleVersion: 3,
      taskId: 'task-1',
    });

    expect(result).toEqual({ dueAt: '2026-05-22T10:00:00.000Z', success: true });
  });

  it.each([
    ['conflict', 'lifecycle_conflict', 'conflict'],
    ['rate_limited', 'rate_limited', 'rate_limited'],
    ['repository_failure', 'repository_failure', 'transient'],
    ['invalid_input', 'invalid_due_at', 'invalid_date'],
    ['invalid_input', 'invalid_timestamp', 'unavailable'],
    ['forbidden', 'subject_not_visible', 'unavailable'],
    ['not_found', 'task_not_found', 'unavailable'],
    ['unauthorized', 'missing_session', 'unavailable'],
  ] as const)('maps %s/%s to the UI-safe %s bucket', async (outcome, reason, error) => {
    hoisted.updateCrmTaskDueAtActionMock.mockResolvedValueOnce({ outcome, reason });

    const result = await submitAgentCrmTaskQueueDueDateAction({
      dueAt: '2026-05-22T10:00:00.000Z',
      expectedLifecycleVersion: 3,
      taskId: 'task-1',
    });

    expect(result).toEqual({ error, success: false });
    if (reason !== error) {
      expect(JSON.stringify(result)).not.toContain(reason);
    }
  });

  it('rejects malformed due-date input before calling the CRM task action', async () => {
    const result = await submitAgentCrmTaskQueueDueDateAction({
      dueAt: 'not-a-date',
      expectedLifecycleVersion: 3,
      taskId: 'task-1',
    });

    expect(result).toEqual({ error: 'invalid_date', success: false });
    expect(hoisted.updateCrmTaskDueAtActionMock).not.toHaveBeenCalled();
  });

  it('rejects malformed task input before calling the CRM task action', async () => {
    const result = await submitAgentCrmTaskQueueDueDateAction({
      dueAt: '2026-05-22T10:00:00.000Z',
      expectedLifecycleVersion: -1,
      taskId: '',
    });

    expect(result).toEqual({ error: 'invalid_date', success: false });
    expect(hoisted.updateCrmTaskDueAtActionMock).not.toHaveBeenCalled();
  });

  it('maps thrown CRM task action failures to the transient bucket', async () => {
    hoisted.updateCrmTaskDueAtActionMock.mockRejectedValueOnce(new Error('database unavailable'));

    const result = await submitAgentCrmTaskQueueDueDateAction({
      dueAt: null,
      expectedLifecycleVersion: 5,
      taskId: 'task-5',
    });

    expect(result).toEqual({ error: 'transient', success: false });
  });
});

describe('submitAgentCrmTaskQueuePriorityAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVisibleAgentTaskQueue();
    mockPriorityActionWithQueueGuard();
  });

  it('updates priority with the fixed manual_priority_change reason code', async () => {
    const result = await submitQueuePriority();

    expect(result).toEqual({ priority: 'urgent', success: true });
    expect(hoisted.updateCrmTaskPriorityActionWithGuardMock).toHaveBeenCalledWith(
      {
        expectedLifecycleVersion: 5,
        priority: 'urgent',
        reasonCode: 'manual_priority_change',
        taskId: 'task-5',
      },
      expect.any(Function)
    );
  });

  it('requires visibility in the current open task queue before mutating', async () => {
    hoisted.readAgentTaskWorkQueueMock.mockResolvedValueOnce([]);

    const result = await submitQueuePriority();

    expect(result).toEqual({ error: 'unavailable', success: false });
  });

  it('maps stale lifecycle versions to a generic conflict bucket', async () => {
    mockVisibleAgentTaskQueue(6);

    const result = await submitQueuePriority();

    expect(result).toEqual({ error: 'conflict', success: false });
  });

  it('treats same-priority idempotency as success when it reaches the server', async () => {
    hoisted.updateCrmTaskPriorityActionWithGuardMock.mockResolvedValueOnce({
      outcome: 'idempotent_replay',
      reason: 'idempotent_replay',
    });

    const result = await submitQueuePriority();

    expect(result).toEqual({ priority: 'urgent', success: true });
  });

  it.each([
    ['conflict', 'lifecycle_conflict', 'conflict'],
    ['conflict', 'terminal_state', 'terminal'],
    ['rate_limited', 'rate_limited', 'rate_limited'],
    ['repository_failure', 'repository_failure', 'transient'],
    ['invalid_input', 'invalid_priority', 'invalid_priority'],
    ['invalid_input', 'invalid_reason_code', 'invalid_priority'],
    ['forbidden', 'subject_not_visible', 'unavailable'],
    ['not_found', 'task_not_found', 'unavailable'],
    ['unauthorized', 'missing_session', 'unavailable'],
  ] as const)('maps %s/%s to the UI-safe %s bucket', async (outcome, reason, error) => {
    hoisted.updateCrmTaskPriorityActionWithGuardMock.mockResolvedValueOnce({ outcome, reason });

    const result = await submitQueuePriority();

    expect(result).toEqual({ error, success: false });
    if (reason !== error) {
      expect(JSON.stringify(result)).not.toContain(reason);
    }
  });

  it('rejects malformed priority input before calling the CRM task action', async () => {
    const result = await submitQueuePriority({
      priority: 'unsupported' as never,
    });

    expect(result).toEqual({ error: 'invalid_priority', success: false });
    expect(hoisted.updateCrmTaskPriorityActionWithGuardMock).not.toHaveBeenCalled();
  });

  it('maps thrown CRM task action failures to the transient bucket', async () => {
    hoisted.updateCrmTaskPriorityActionWithGuardMock.mockRejectedValueOnce(
      new Error('database unavailable')
    );

    const result = await submitQueuePriority();

    expect(result).toEqual({ error: 'transient', success: false });
  });
});
