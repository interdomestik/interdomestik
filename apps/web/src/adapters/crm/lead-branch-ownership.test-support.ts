import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { vi } from 'vitest';

export function createOwnershipMocks() {
  return {
    and: vi.fn((...args: unknown[]) => ({ args, op: 'and' })),
    asc: vi.fn((value: unknown) => ({ op: 'asc', value })),
    branchFindFirst: vi.fn(),
    crmLeadFindFirst: vi.fn(),
    eq: vi.fn((left: unknown, right: unknown) => ({ left, op: 'eq', right })),
    insert: vi.fn(),
    insertReturning: vi.fn(),
    insertValues: vi.fn(),
    inArray: vi.fn((left: unknown, right: unknown) => ({ left, op: 'inArray', right })),
    isNull: vi.fn((value: unknown) => ({ op: 'isNull', value })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    transaction: vi.fn(),
    update: vi.fn(),
    updateReturning: vi.fn(),
    updateSet: vi.fn(),
    updateWhere: vi.fn(),
    userFindFirst: vi.fn(),
    withTenantContext: vi.fn(),
    withTenant: vi.fn((tenantId: string, column: unknown, condition: unknown) => ({
      column,
      condition,
      op: 'withTenant',
      tenantId,
    })),
  };
}

export const schemaMock = {
  branches: {
    id: { name: 'targetBranchId' },
    tenantId: { name: 'targetBranchTenantId' },
  },
  crmActivities: {
    agentId: { name: 'activityAgentId' },
    branchId: { name: 'activityBranchId' },
    completedAt: { name: 'completedAt' },
    createdAt: { name: 'activityCreatedAt' },
    id: { name: 'activityId' },
    leadId: { name: 'activityLeadId' },
    scheduledAt: { name: 'scheduledAt' },
    summary: { name: 'summary' },
    tenantId: { name: 'activityTenantId' },
    type: { name: 'activityType' },
  },
  crmLeadStageHistory: {
    changedById: { name: 'historyChangedById' },
    createdAt: { name: 'historyCreatedAt' },
    fromStage: { name: 'historyFromStage' },
    id: { name: 'historyId' },
    leadId: { name: 'historyLeadId' },
    occurredAt: { name: 'historyOccurredAt' },
    tenantId: { name: 'historyTenantId' },
    toStage: { name: 'historyToStage' },
  },
  crmLeadOwnershipHistory: {
    agentId: { name: 'ownershipAgentId' },
    branchId: { name: 'ownershipBranchId' },
    changedById: { name: 'ownershipChangedById' },
    createdAt: { name: 'ownershipCreatedAt' },
    effectiveFrom: { name: 'ownershipEffectiveFrom' },
    effectiveTo: { name: 'ownershipEffectiveTo' },
    id: { name: 'ownershipId' },
    leadId: { name: 'ownershipLeadId' },
    reason: { name: 'ownershipReason' },
    tenantId: { name: 'ownershipTenantId' },
  },
  crmLeads: {
    agentId: { name: 'agentId' },
    branchId: { name: 'branchId' },
    createdAt: { name: 'createdAt' },
    id: { name: 'id' },
    lostAt: { name: 'lostAt' },
    stage: { name: 'stage' },
    tenantId: { name: 'tenantId' },
    updatedAt: { name: 'updatedAt' },
    wonAt: { name: 'wonAt' },
  },
  crmTasks: {
    assignedActorId: { name: 'taskAssignedActorId' },
    assignedKind: { name: 'taskAssignedKind' },
    branchId: { name: 'taskBranchId' },
    createReasonCode: { name: 'taskCreateReasonCode' },
    createdAt: { name: 'taskCreatedAt' },
    dueAt: { name: 'taskDueAt' },
    id: { name: 'taskId' },
    lifecycleVersion: { name: 'taskLifecycleVersion' },
    status: { name: 'taskStatus' },
    subjectId: { name: 'taskSubjectId' },
    subjectKind: { name: 'taskSubjectKind' },
    tenantId: { name: 'taskTenantId' },
  },
  user: {
    branchId: { name: 'targetAgentBranchId' },
    id: { name: 'targetAgentId' },
    role: { name: 'targetAgentRole' },
    tenantId: { name: 'targetAgentTenantId' },
  },
};

export const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-original' },
  tenantId: 'tenant-1',
};

export function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    agentId: 'agent-1',
    branchId: 'branch-original',
    companyName: null,
    createdAt: new Date('2026-05-10T08:00:00.000Z'),
    email: null,
    fullName: 'Lead One',
    id: 'lead-1',
    notes: null,
    phone: null,
    score: 0,
    source: 'manual',
    stage: 'new',
    tenantId: 'tenant-1',
    type: 'individual',
    updatedAt: new Date('2026-05-10T08:00:00.000Z'),
    ...overrides,
  };
}
