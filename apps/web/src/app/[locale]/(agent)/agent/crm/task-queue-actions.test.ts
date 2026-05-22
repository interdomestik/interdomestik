import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  completeCrmTaskActionMock: vi.fn(),
  startCrmTaskActionMock: vi.fn(),
  updateCrmTaskDueAtActionMock: vi.fn(),
}));

vi.mock('@/actions/crm-tasks', () => ({
  completeCrmTaskAction: hoisted.completeCrmTaskActionMock,
  startCrmTaskAction: hoisted.startCrmTaskActionMock,
  updateCrmTaskDueAtAction: hoisted.updateCrmTaskDueAtActionMock,
}));

import {
  submitAgentCrmTaskQueueDueDateAction,
  submitAgentCrmTaskQueueLifecycleAction,
} from './task-queue-actions';

describe('submitAgentCrmTaskQueueLifecycleAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.completeCrmTaskActionMock.mockResolvedValue({ outcome: 'success' });
    hoisted.startCrmTaskActionMock.mockResolvedValue({ outcome: 'success' });
    hoisted.updateCrmTaskDueAtActionMock.mockResolvedValue({ outcome: 'success' });
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
