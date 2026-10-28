import { beforeEach, expect, vi } from 'vitest';

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

const mocks = vi.hoisted(() => ({
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
  withTenantContext: vi.fn(),
  update: vi.fn(),
  updateReturning: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  userFindFirst: vi.fn(),
  withTenant: vi.fn((tenantId: string, column: unknown, condition: unknown) => ({
    column,
    condition,
    op: 'withTenant',
    tenantId,
  })),
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  asc: mocks.asc,
  eq: mocks.eq,
  inArray: mocks.inArray,
  isNull: mocks.isNull,
  sql: mocks.sql,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/database/schema', () => ({
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
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    execute: vi.fn(),
    insert: mocks.insert,
    query: {
      branches: {
        findFirst: mocks.branchFindFirst,
      },
      crmLeads: {
        findFirst: mocks.crmLeadFindFirst,
      },
      user: {
        findFirst: mocks.userFindFirst,
      },
    },
    select: vi.fn(),
    transaction: mocks.transaction,
    update: mocks.update,
  },
}));

import { crmLeadFollowUpRepository } from './lead-follow-up-repository';
import { crmLeadMutationRepository } from './lead-mutation-repository';

type TransferOwnershipParams = Parameters<typeof crmLeadMutationRepository.transferOwnership>[0];

const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-original' },
  tenantId: 'tenant-1',
};

function leadRow(overrides: Record<string, unknown> = {}) {
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

async function expectTransferRejectedBeforeMutation(
  overrides: Partial<TransferOwnershipParams> = {}
) {
  await expect(
    crmLeadMutationRepository.transferOwnership({
      actor: { ...actor, actorId: 'staff-1', role: 'staff' },
      currentAgentId: 'agent-1',
      currentBranchId: 'branch-original',
      leadId: 'lead-1',
      reason: 'handover',
      targetAgentId: 'agent-2',
      targetBranchId: 'branch-original',
      ...overrides,
    })
  ).resolves.toBeNull();

  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withTenantContext.mockImplementation(
    async (_context: unknown, action: (tx: unknown) => unknown) =>
      action({ query: { crmLeads: { findFirst: mocks.crmLeadFindFirst } } })
  );

  mocks.insert.mockReturnValue({ values: mocks.insertValues });
  mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning });

  mocks.update.mockReturnValue({ set: mocks.updateSet });
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
  mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
  mocks.branchFindFirst.mockResolvedValue({ id: 'branch-original' });
  mocks.userFindFirst.mockResolvedValue({ id: 'agent-2' });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ insert: mocks.insert, update: mocks.update })
  );
});

export {
  mocks,
  actor,
  leadRow,
  expectTransferRejectedBeforeMutation,
  crmLeadFollowUpRepository,
  crmLeadMutationRepository,
};
