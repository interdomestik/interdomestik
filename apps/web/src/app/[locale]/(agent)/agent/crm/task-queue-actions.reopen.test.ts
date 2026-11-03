import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hoisted,
  mockAgentActor,
  mockAuthority,
  mockReopenActionWithQueueGuard,
  mockVisibleAgentCompletedTaskQueue,
  submitQueueReopen,
} from './task-queue-actions.test-support';

describe('submitAgentCrmTaskQueueReopenAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVisibleAgentCompletedTaskQueue();
    mockReopenActionWithQueueGuard();
  });

  it('reopens a completed queue task with an explicit UI-exposed reason code', async () => {
    const result = await submitQueueReopen({
      reasonCode: 'incomplete',
    });

    expect(result).toEqual({ reasonCode: 'incomplete', success: true });
    expect(hoisted.createAgentCrmTaskWorkQueueRepositoryMock.mock.calls[0][0]).toBe(mockAuthority);
    expect(hoisted.readAgentCompletedTaskQueueMock).toHaveBeenCalledWith({
      actor: mockAgentActor,
      now: expect.any(String),
    });
    expect(hoisted.reopenCrmTaskActionWithGuardMock).toHaveBeenCalledWith(
      {
        expectedLifecycleVersion: 5,
        reasonCode: 'incomplete',
        taskId: 'task-5',
      },
      expect.any(Function)
    );
  });

  it('treats CRM26 idempotent replay as reopen success', async () => {
    hoisted.reopenCrmTaskActionWithGuardMock.mockResolvedValueOnce({
      outcome: 'idempotent_replay',
      reason: 'idempotent_replay',
    });

    const result = await submitQueueReopen({
      reasonCode: 'manually_reopened',
    });

    expect(result).toEqual({ reasonCode: 'manually_reopened', success: true });
  });

  it('fails closed before reopen when the task is not in the completed queue', async () => {
    hoisted.readAgentCompletedTaskQueueMock.mockResolvedValueOnce([]);

    const result = await submitQueueReopen();

    expect(result).toEqual({ error: 'unavailable', success: false });
  });

  it('maps completed queue lifecycle-version drift to a conflict before reopen', async () => {
    hoisted.readAgentCompletedTaskQueueMock.mockResolvedValueOnce([
      { lifecycleVersion: 6, taskId: 'task-5' },
    ]);

    const result = await submitQueueReopen();

    expect(result).toEqual({ error: 'conflict', success: false });
  });

  it.each([
    ['conflict', 'terminal_state', 'terminal'],
    ['conflict', 'lifecycle_conflict', 'conflict'],
    ['rate_limited', 'rate_limited', 'rate_limited'],
    ['repository_failure', 'repository_failure', 'transient'],
    ['invalid_input', 'invalid_reason_code', 'invalid_reason'],
    ['invalid_input', 'unsupported_transition', 'conflict'],
    ['forbidden', 'subject_not_visible', 'unavailable'],
    ['not_found', 'task_not_found', 'unavailable'],
    ['unauthorized', 'missing_session', 'unavailable'],
  ] as const)('maps %s/%s to the UI-safe %s bucket', async (outcome, reason, error) => {
    hoisted.reopenCrmTaskActionWithGuardMock.mockResolvedValueOnce({ outcome, reason });

    const result = await submitQueueReopen();

    expect(result).toEqual({ error, success: false });
    if (reason !== error) {
      expect(JSON.stringify(result)).not.toContain(reason);
    }
  });

  it('rejects malformed or unsupported reopen reasons before calling the CRM task action', async () => {
    const result = await submitQueueReopen({
      reasonCode: 'duplicate',
    } as never);

    expect(result).toEqual({ error: 'invalid_reason', success: false });
    expect(hoisted.reopenCrmTaskActionWithGuardMock).not.toHaveBeenCalled();
  });

  it('rejects malformed task input before calling the CRM task action', async () => {
    const result = await submitQueueReopen({
      expectedLifecycleVersion: -1,
      taskId: '',
    });

    expect(result).toEqual({ error: 'unavailable', success: false });
    expect(hoisted.reopenCrmTaskActionWithGuardMock).not.toHaveBeenCalled();
  });

  it('maps thrown CRM task action failures to the transient bucket', async () => {
    hoisted.reopenCrmTaskActionWithGuardMock.mockRejectedValueOnce(
      new Error('database unavailable')
    );

    const result = await submitQueueReopen();

    expect(result).toEqual({ error: 'transient', success: false });
  });
});
