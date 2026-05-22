import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  completeCrmTaskActionMock: vi.fn(),
  startCrmTaskActionMock: vi.fn(),
}));

vi.mock('@/actions/crm-tasks', () => ({
  completeCrmTaskAction: hoisted.completeCrmTaskActionMock,
  startCrmTaskAction: hoisted.startCrmTaskActionMock,
}));

import { submitAgentCrmTaskQueueLifecycleAction } from './task-queue-actions';

describe('submitAgentCrmTaskQueueLifecycleAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.completeCrmTaskActionMock.mockResolvedValue({ outcome: 'success' });
    hoisted.startCrmTaskActionMock.mockResolvedValue({ outcome: 'success' });
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
