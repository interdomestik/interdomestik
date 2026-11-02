import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
import { type CrmTask, type CrmTaskRepository } from '@interdomestik/domain-crm/tasks';

const hoisted = vi.hoisted(() => ({
  createCrmTaskRepository: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/adapters/crm/task-repository', () => ({
  createCrmTaskRepository: hoisted.createCrmTaskRepository,
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'task-1',
}));

export const TEST_AUTHORITY = mintTestTenantAuthority('tenant-1');
export const TEST_NOW = '2026-05-21T10:00:00.000Z';
export const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

export function session(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      branchId: 'branch-1',
      id: 'agent-1',
      role: 'agent',
      tenantId: 'tenant-1',
      ...overrides,
    },
  };
}

export function task(overrides: Partial<CrmTask> = {}): CrmTask {
  return {
    assignedTo: { kind: 'unassigned' },
    branchId: 'branch-1',
    cancelledAt: null,
    cancellationReasonCode: null,
    completedAt: null,
    completionReasonCode: null,
    createReasonCode: 'manual',
    createdAt: TEST_NOW,
    createdBy: {
      actorId: 'agent-1',
      branchId: 'branch-1',
      role: 'agent',
      tenantId: 'tenant-1',
    },
    dueAt: null,
    history: [
      {
        actor: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        event: 'created',
        fromStatus: null,
        reasonCode: 'manual',
        timestamp: TEST_NOW,
        toStatus: 'pending',
      },
    ],
    idempotencyKey: 'idem-1',
    lifecycleVersion: 1,
    priority: 'normal',
    reopenedAt: null,
    reopenReasonCode: null,
    status: 'pending',
    subjectReference: { id: 'lead-1', kind: 'lead' },
    taskId: 'task-1',
    tenantId: 'tenant-1',
    updatedAt: TEST_NOW,
    ...overrides,
  };
}

export function repository(overrides: Partial<CrmTaskRepository> = {}) {
  return {
    appendTaskHistory: vi.fn(),
    findTaskById: vi.fn(),
    findTaskByIdempotencyKey: vi.fn().mockResolvedValue(null),
    saveTask: vi.fn(async ({ task: saved }) => await saved),
    validateSubjectReference: vi.fn().mockResolvedValue({
      branchId: 'branch-1',
      tenantId: 'tenant-1',
      visible: true,
    }),
    ...overrides,
  } satisfies CrmTaskRepository;
}

export function deps(repo = repository()) {
  return {
    audit: vi.fn().mockResolvedValue(undefined),
    now: () => TEST_NOW,
    rateLimit: vi.fn().mockResolvedValue({ limited: false }),
    repository: repo,
    revalidate: vi.fn(),
    taskId: () => 'task-1',
  };
}

export function createInput() {
  return {
    assignedTo: { kind: 'unassigned' } as const,
    createReasonCode: 'manual' as const,
    idempotencyKey: 'idem-1',
    priority: 'normal' as const,
    subjectReference: { id: 'lead-1', kind: 'lead' as const },
    taskId: 'task-1',
  };
}

export { hoisted };
