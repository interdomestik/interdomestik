import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  cancelCrmTaskActionWithGuardMock: vi.fn(),
  completeCrmTaskActionMock: vi.fn(),
  readAgentCompletedTaskQueueMock: vi.fn(),
  readAgentTaskWorkQueueMock: vi.fn(),
  reopenCrmTaskActionWithGuardMock: vi.fn(),
  startCrmTaskActionMock: vi.fn(),
  updateCrmTaskDueAtActionMock: vi.fn(),
  updateCrmTaskPriorityActionWithGuardMock: vi.fn(),
}));

vi.mock('@/actions/crm-tasks', () => ({
  cancelCrmTaskActionWithGuard: hoisted.cancelCrmTaskActionWithGuardMock,
  completeCrmTaskAction: hoisted.completeCrmTaskActionMock,
  reopenCrmTaskActionWithGuard: hoisted.reopenCrmTaskActionWithGuardMock,
  startCrmTaskAction: hoisted.startCrmTaskActionMock,
  updateCrmTaskDueAtAction: hoisted.updateCrmTaskDueAtActionMock,
  updateCrmTaskPriorityActionWithGuard: hoisted.updateCrmTaskPriorityActionWithGuardMock,
}));

vi.mock('@/adapters/crm/task-work-queue-repository', () => ({
  agentCrmTaskWorkQueueRepository: {
    readAgentCompletedTaskQueue: hoisted.readAgentCompletedTaskQueueMock,
    readAgentTaskWorkQueue: hoisted.readAgentTaskWorkQueueMock,
  },
}));

import {
  submitAgentCrmTaskQueueCancellationAction,
  submitAgentCrmTaskQueueDueDateAction,
  submitAgentCrmTaskQueueLifecycleAction,
  submitAgentCrmTaskQueuePriorityAction,
  submitAgentCrmTaskQueueReopenAction,
} from './task-queue-actions';

const mockRequestHeaders = new Headers();
const mockAgentActor = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1', memberId: null, staffId: null },
  tenantId: 'tenant-1',
};

function mockVisibleAgentTaskQueue(lifecycleVersion = 5): void {
  hoisted.readAgentTaskWorkQueueMock.mockResolvedValue([{ lifecycleVersion, taskId: 'task-5' }]);
}

function mockVisibleAgentCompletedTaskQueue(lifecycleVersion = 5): void {
  hoisted.readAgentCompletedTaskQueueMock.mockResolvedValue([
    { lifecycleVersion, taskId: 'task-5' },
  ]);
}

function mockCancelActionWithQueueGuard(): void {
  hoisted.cancelCrmTaskActionWithGuardMock.mockImplementation(async (input, guard) => {
    const guardResult = guard
      ? await guard({
          actor: mockAgentActor,
          deps: {},
          input,
          requestHeaders: mockRequestHeaders,
        })
      : null;

    return guardResult ?? { outcome: 'success' };
  });
}

function mockReopenActionWithQueueGuard(): void {
  hoisted.reopenCrmTaskActionWithGuardMock.mockImplementation(async (input, guard) => {
    const guardResult = guard
      ? await guard({
          actor: mockAgentActor,
          deps: {},
          input,
          requestHeaders: mockRequestHeaders,
        })
      : null;

    return guardResult ?? { outcome: 'success' };
  });
}

function mockPriorityActionWithQueueGuard(): void {
  hoisted.updateCrmTaskPriorityActionWithGuardMock.mockImplementation(async (input, guard) => {
    const guardResult = guard
      ? await guard({
          actor: mockAgentActor,
          deps: {},
          input,
          requestHeaders: mockRequestHeaders,
        })
      : null;

    return guardResult ?? { outcome: 'success' };
  });
}

function submitQueueCancellation(
  overrides: Partial<Parameters<typeof submitAgentCrmTaskQueueCancellationAction>[0]> = {}
) {
  return submitAgentCrmTaskQueueCancellationAction({
    expectedLifecycleVersion: 5,
    reasonCode: 'not_needed',
    taskId: 'task-5',
    ...overrides,
  });
}

function submitQueueReopen(
  overrides: Partial<Parameters<typeof submitAgentCrmTaskQueueReopenAction>[0]> = {}
) {
  return submitAgentCrmTaskQueueReopenAction({
    expectedLifecycleVersion: 5,
    reasonCode: 'follow_up_required',
    taskId: 'task-5',
    ...overrides,
  });
}

function submitQueuePriority(
  overrides: Partial<Parameters<typeof submitAgentCrmTaskQueuePriorityAction>[0]> = {}
) {
  return submitAgentCrmTaskQueuePriorityAction({
    expectedLifecycleVersion: 5,
    priority: 'urgent',
    taskId: 'task-5',
    ...overrides,
  });
}

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
