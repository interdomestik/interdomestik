import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
import {
  submitAgentCrmTaskQueueCancellationAction,
  submitAgentCrmTaskQueuePriorityAction,
  submitAgentCrmTaskQueueReopenAction,
} from './task-queue-actions';

const hoisted = vi.hoisted(() => ({
  cancelCrmTaskActionWithGuardMock: vi.fn(),
  completeCrmTaskActionMock: vi.fn(),
  createAgentCrmTaskWorkQueueRepositoryMock: vi.fn(),
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
  createAgentCrmTaskWorkQueueRepository: hoisted.createAgentCrmTaskWorkQueueRepositoryMock,
}));

hoisted.createAgentCrmTaskWorkQueueRepositoryMock.mockReturnValue({
  readAgentCompletedTaskQueue: hoisted.readAgentCompletedTaskQueueMock,
  readAgentTaskWorkQueue: hoisted.readAgentTaskWorkQueueMock,
});

export const mockRequestHeaders = new Headers();
export const mockAuthority = mintTestTenantAuthority('tenant-1');
export const mockAgentActor = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1', memberId: null, staffId: null },
  tenantId: 'tenant-1',
};

export function mockVisibleAgentTaskQueue(lifecycleVersion = 5): void {
  hoisted.readAgentTaskWorkQueueMock.mockResolvedValue([{ lifecycleVersion, taskId: 'task-5' }]);
}

export function mockVisibleAgentCompletedTaskQueue(lifecycleVersion = 5): void {
  hoisted.readAgentCompletedTaskQueueMock.mockResolvedValue([
    { lifecycleVersion, taskId: 'task-5' },
  ]);
}

export function mockCancelActionWithQueueGuard(): void {
  hoisted.cancelCrmTaskActionWithGuardMock.mockImplementation(async (input, guard) => {
    const guardResult = guard
      ? await guard({
          actor: mockAgentActor,
          authority: mockAuthority,
          deps: {},
          input,
          requestHeaders: mockRequestHeaders,
        })
      : null;

    return guardResult ?? { outcome: 'success' };
  });
}

export function mockReopenActionWithQueueGuard(): void {
  hoisted.reopenCrmTaskActionWithGuardMock.mockImplementation(async (input, guard) => {
    const guardResult = guard
      ? await guard({
          actor: mockAgentActor,
          authority: mockAuthority,
          deps: {},
          input,
          requestHeaders: mockRequestHeaders,
        })
      : null;

    return guardResult ?? { outcome: 'success' };
  });
}

export function mockPriorityActionWithQueueGuard(): void {
  hoisted.updateCrmTaskPriorityActionWithGuardMock.mockImplementation(async (input, guard) => {
    const guardResult = guard
      ? await guard({
          actor: mockAgentActor,
          authority: mockAuthority,
          deps: {},
          input,
          requestHeaders: mockRequestHeaders,
        })
      : null;

    return guardResult ?? { outcome: 'success' };
  });
}

export function submitQueueCancellation(
  overrides: Partial<Parameters<typeof submitAgentCrmTaskQueueCancellationAction>[0]> = {}
) {
  return submitAgentCrmTaskQueueCancellationAction({
    expectedLifecycleVersion: 5,
    reasonCode: 'not_needed',
    taskId: 'task-5',
    ...overrides,
  });
}

export function submitQueueReopen(
  overrides: Partial<Parameters<typeof submitAgentCrmTaskQueueReopenAction>[0]> = {}
) {
  return submitAgentCrmTaskQueueReopenAction({
    expectedLifecycleVersion: 5,
    reasonCode: 'follow_up_required',
    taskId: 'task-5',
    ...overrides,
  });
}

export function submitQueuePriority(
  overrides: Partial<Parameters<typeof submitAgentCrmTaskQueuePriorityAction>[0]> = {}
) {
  return submitAgentCrmTaskQueuePriorityAction({
    expectedLifecycleVersion: 5,
    priority: 'urgent',
    taskId: 'task-5',
    ...overrides,
  });
}

export { hoisted };
