import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hoisted,
  mockAgentActor,
  mockAuthority,
  mockCancelActionWithQueueGuard,
  mockVisibleAgentTaskQueue,
  submitQueueCancellation,
} from './task-queue-actions.test-support';
import { submitAgentCrmTaskQueueLifecycleAction } from './task-queue-actions';

describe('submitAgentCrmTaskQueueLifecycleAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.completeCrmTaskActionMock.mockResolvedValue({ outcome: 'success' });
    hoisted.startCrmTaskActionMock.mockResolvedValue({ outcome: 'success' });
    hoisted.updateCrmTaskDueAtActionMock.mockResolvedValue({ outcome: 'success' });
    mockVisibleAgentTaskQueue();
    mockCancelActionWithQueueGuard();
  });

  it('starts a task with the fixed manual_start reason code', async () => {
    const result = await submitAgentCrmTaskQueueLifecycleAction({
      action: 'start',
      expectedLifecycleVersion: 3,
      taskId: 'task-1',
    });

    expect(result).toEqual({ action: 'start', success: true });
    expect(hoisted.startCrmTaskActionMock).toHaveBeenCalledWith({
      expectedLifecycleVersion: 3,
      reasonCode: 'manual_start',
      taskId: 'task-1',
    });
    expect(hoisted.completeCrmTaskActionMock).not.toHaveBeenCalled();
  });

  it('completes a task with the fixed resolved reason code', async () => {
    const result = await submitAgentCrmTaskQueueLifecycleAction({
      action: 'complete',
      expectedLifecycleVersion: 4,
      taskId: 'task-2',
    });

    expect(result).toEqual({ action: 'complete', success: true });
    expect(hoisted.completeCrmTaskActionMock).toHaveBeenCalledWith({
      expectedLifecycleVersion: 4,
      reasonCode: 'resolved',
      taskId: 'task-2',
    });
    expect(hoisted.startCrmTaskActionMock).not.toHaveBeenCalled();
  });

  it.each([
    ['conflict', 'conflict'],
    ['rate_limited', 'rate_limited'],
    ['repository_failure', 'transient'],
    ['forbidden', 'unavailable'],
    ['not_found', 'unavailable'],
    ['invalid_input', 'unavailable'],
    ['unauthorized', 'unavailable'],
  ] as const)('maps %s to the UI-safe %s bucket', async (outcome, error) => {
    hoisted.startCrmTaskActionMock.mockResolvedValueOnce({ outcome, reason: 'raw_reason' });

    const result = await submitAgentCrmTaskQueueLifecycleAction({
      action: 'start',
      expectedLifecycleVersion: 1,
      taskId: 'task-3',
    });

    expect(result).toEqual({ action: 'start', error, success: false });
    expect(JSON.stringify(result)).not.toContain('raw_reason');
  });

  it('rejects malformed input without calling the CRM task action', async () => {
    const result = await submitAgentCrmTaskQueueLifecycleAction({
      action: 'complete',
      expectedLifecycleVersion: -1,
      taskId: '',
    });

    expect(result).toEqual({ action: 'complete', error: 'unavailable', success: false });
    expect(hoisted.completeCrmTaskActionMock).not.toHaveBeenCalled();
    expect(hoisted.startCrmTaskActionMock).not.toHaveBeenCalled();
  });

  it('rejects untrusted malformed input without throwing', async () => {
    const result = await submitAgentCrmTaskQueueLifecycleAction({
      action: 'archive',
      expectedLifecycleVersion: 'latest',
      taskId: null,
    } as never);

    expect(result).toEqual({ action: 'start', error: 'unavailable', success: false });
    expect(hoisted.completeCrmTaskActionMock).not.toHaveBeenCalled();
    expect(hoisted.startCrmTaskActionMock).not.toHaveBeenCalled();
  });

  it('maps thrown CRM task action failures to the transient bucket', async () => {
    hoisted.completeCrmTaskActionMock.mockRejectedValueOnce(new Error('database unavailable'));

    const result = await submitAgentCrmTaskQueueLifecycleAction({
      action: 'complete',
      expectedLifecycleVersion: 5,
      taskId: 'task-5',
    });

    expect(result).toEqual({ action: 'complete', error: 'transient', success: false });
  });
});

describe('submitAgentCrmTaskQueueCancellationAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVisibleAgentTaskQueue();
    mockCancelActionWithQueueGuard();
  });

  it('cancels a task with an explicit UI-exposed cancellation reason code', async () => {
    const result = await submitQueueCancellation({
      reasonCode: 'duplicate',
    });

    expect(result).toEqual({ reasonCode: 'duplicate', success: true });
    expect(hoisted.createAgentCrmTaskWorkQueueRepositoryMock.mock.calls[0][0]).toBe(mockAuthority);
    expect(hoisted.readAgentTaskWorkQueueMock).toHaveBeenCalledWith({
      actor: mockAgentActor,
      now: expect.any(String),
    });
    expect(hoisted.cancelCrmTaskActionWithGuardMock).toHaveBeenCalledWith(
      {
        expectedLifecycleVersion: 5,
        reasonCode: 'duplicate',
        taskId: 'task-5',
      },
      expect.any(Function)
    );
  });

  it('treats same-reason idempotency as success', async () => {
    hoisted.cancelCrmTaskActionWithGuardMock.mockResolvedValueOnce({
      outcome: 'idempotent_replay',
      reason: 'idempotent_replay',
    });

    const result = await submitQueueCancellation({
      reasonCode: 'created_in_error',
    });

    expect(result).toEqual({ reasonCode: 'created_in_error', success: true });
  });

  it('fails closed before cancellation when the task is not in the visible agent queue', async () => {
    hoisted.readAgentTaskWorkQueueMock.mockResolvedValueOnce([]);

    const result = await submitQueueCancellation();

    expect(result).toEqual({ error: 'unavailable', success: false });
  });

  it('maps visible queue lifecycle-version drift to a conflict before cancellation', async () => {
    hoisted.readAgentTaskWorkQueueMock.mockResolvedValueOnce([
      { lifecycleVersion: 6, taskId: 'task-5' },
    ]);

    const result = await submitQueueCancellation();

    expect(result).toEqual({ error: 'conflict', success: false });
  });

  it.each([
    ['conflict', 'terminal_state', 'conflict'],
    ['rate_limited', 'rate_limited', 'rate_limited'],
    ['repository_failure', 'repository_failure', 'transient'],
    ['invalid_input', 'invalid_reason_code', 'invalid_reason'],
    ['invalid_input', 'unsupported_transition', 'conflict'],
    ['forbidden', 'subject_not_visible', 'unavailable'],
    ['not_found', 'task_not_found', 'unavailable'],
    ['unauthorized', 'missing_session', 'unavailable'],
  ] as const)('maps %s/%s to the UI-safe %s bucket', async (outcome, reason, error) => {
    hoisted.cancelCrmTaskActionWithGuardMock.mockResolvedValueOnce({ outcome, reason });

    const result = await submitQueueCancellation();

    expect(result).toEqual({ error, success: false });
    if (reason !== error) {
      expect(JSON.stringify(result)).not.toContain(reason);
    }
  });

  it('rejects subject_closed because CRM31 does not expose that reason in the queue picker', async () => {
    const result = await submitQueueCancellation({
      reasonCode: 'subject_closed',
    } as never);

    expect(result).toEqual({ error: 'invalid_reason', success: false });
    expect(hoisted.cancelCrmTaskActionWithGuardMock).not.toHaveBeenCalled();
  });

  it('rejects malformed task input before calling the CRM task action', async () => {
    const result = await submitQueueCancellation({
      expectedLifecycleVersion: -1,
      taskId: '',
    });

    expect(result).toEqual({ error: 'unavailable', success: false });
    expect(hoisted.cancelCrmTaskActionWithGuardMock).not.toHaveBeenCalled();
  });

  it('maps thrown CRM task action failures to the transient bucket', async () => {
    hoisted.cancelCrmTaskActionWithGuardMock.mockRejectedValueOnce(
      new Error('database unavailable')
    );

    const result = await submitQueueCancellation();

    expect(result).toEqual({ error: 'transient', success: false });
  });
});
