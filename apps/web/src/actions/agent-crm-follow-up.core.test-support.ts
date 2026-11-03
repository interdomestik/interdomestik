import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCrmLeadFollowUpRepository: vi.fn(),
  completeFollowUpActivity: vi.fn(),
  completeCrmTaskCore: vi.fn(),
  createCrmTaskCore: vi.fn(),
  createFollowUpActivity: vi.fn(),
  findById: vi.fn(),
  listCrmLeadFollowUpActivitiesForLead: vi.fn(),
  listCrmLeadFollowUpTasksForLead: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/adapters/crm/lead-follow-up-repository', () => ({
  createCrmLeadFollowUpRepository: mocks.createCrmLeadFollowUpRepository,
  listCrmLeadFollowUpActivitiesForLead: mocks.listCrmLeadFollowUpActivitiesForLead,
  listCrmLeadFollowUpTasksForLead: mocks.listCrmLeadFollowUpTasksForLead,
}));

vi.mock('./crm-tasks.core', () => ({
  completeCrmTaskCore: mocks.completeCrmTaskCore,
  createCrmTaskCore: mocks.createCrmTaskCore,
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'follow-up-1',
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

export const authority = mintTestTenantAuthority('tenant-1');

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

export function lead(overrides: Record<string, unknown> = {}) {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    createdAt: '2026-05-10T08:00:00.000Z',
    id: 'lead-1',
    stage: 'new',
    tenantId: 'tenant-1',
    type: 'individual',
    ...overrides,
  };
}

export function activity(overrides: Record<string, unknown> = {}) {
  return {
    agentId: 'agent-1',
    completedAt: null,
    createdAt: '2026-05-10T08:00:00.000Z',
    description: null,
    id: 'follow-up-1',
    leadId: 'lead-1',
    occurredAt: '2026-05-10T08:00:00.000Z',
    scheduledAt: '2026-05-10T09:00:00.000Z',
    subject: 'Follow up',
    tenantId: 'tenant-1',
    type: 'follow_up',
    ...overrides,
  };
}

export { mocks };
