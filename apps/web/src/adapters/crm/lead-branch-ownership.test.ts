import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

const mocks = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ args, op: 'and' })),
  branchFindFirst: vi.fn(),
  crmLeadFindFirst: vi.fn(),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, op: 'eq', right })),
  insert: vi.fn(),
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  isNull: vi.fn((value: unknown) => ({ op: 'isNull', value })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  transaction: vi.fn(),
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
  eq: mocks.eq,
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
  user: {
    branchId: { name: 'targetAgentBranchId' },
    id: { name: 'targetAgentId' },
    role: { name: 'targetAgentRole' },
    tenantId: { name: 'targetAgentTenantId' },
  },
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

describe('CRM durable lead branch ownership repositories', () => {
  it('persists the actor branch on new CRM leads', async () => {
    mocks.insertReturning.mockResolvedValue([leadRow()]);

    await expect(
      crmLeadMutationRepository.createLead({
        actor,
        lead: {
          leadId: 'lead-1',
          stage: 'new',
          type: 'individual',
        },
      })
    ).resolves.toMatchObject({ branchId: 'branch-original', id: 'lead-1' });

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        branchId: 'branch-original',
        tenantId: 'tenant-1',
      })
    );
  });

  it('writes an initial ownership history row when creating a CRM lead', async () => {
    mocks.insertReturning.mockResolvedValue([leadRow()]);

    await expect(
      crmLeadMutationRepository.createLead({
        actor,
        lead: {
          leadId: 'lead-1',
          stage: 'new',
          type: 'individual',
        },
      })
    ).resolves.toMatchObject({ id: 'lead-1' });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        branchId: 'branch-original',
        changedById: 'agent-1',
        leadId: 'lead-1',
        reason: 'created',
        tenantId: 'tenant-1',
      })
    );
  });

  it('reads CRM lead branch ownership from the lead row instead of the current agent row', async () => {
    mocks.crmLeadFindFirst.mockResolvedValue(leadRow({ branchId: 'branch-original' }));
    mocks.userFindFirst.mockResolvedValue({ branchId: 'branch-new' });

    await expect(
      crmLeadMutationRepository.findById({
        actor: { ...actor, scope: { ...actor.scope, branchId: 'branch-new' } },
        leadId: 'lead-1',
      })
    ).resolves.toMatchObject({ branchId: 'branch-original' });

    expect(mocks.userFindFirst).not.toHaveBeenCalled();
  });

  it('keeps follow-up authorization reads on the durable lead branch row', async () => {
    mocks.crmLeadFindFirst.mockResolvedValue(leadRow({ branchId: 'branch-original' }));
    mocks.userFindFirst.mockResolvedValue({ branchId: 'branch-new' });

    await expect(
      crmLeadFollowUpRepository.findById({
        actor: { ...actor, scope: { ...actor.scope, branchId: 'branch-new' } },
        leadId: 'lead-1',
      })
    ).resolves.toMatchObject({ branchId: 'branch-original' });

    expect(mocks.userFindFirst).not.toHaveBeenCalled();
  });

  it('constrains stage updates by tenant, agent, and durable branch', async () => {
    mocks.updateReturning.mockResolvedValue([leadRow({ stage: 'contacted' })]);

    await expect(
      crmLeadMutationRepository.updateStage({
        actor,
        fromStage: 'new',
        leadId: 'lead-1',
        stage: 'contacted',
      })
    ).resolves.toMatchObject({ branchId: 'branch-original', stage: 'contacted' });

    expect(mocks.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          expect.objectContaining({
            left: expect.objectContaining({ name: 'branchId' }),
            right: 'branch-original',
          }),
          expect.objectContaining({
            left: expect.objectContaining({ name: 'stage' }),
            right: 'new',
          }),
        ]),
      })
    );
  });

  it('writes exactly one stage history row after a successful scoped transition', async () => {
    mocks.updateReturning.mockResolvedValue([leadRow({ stage: 'contacted' })]);

    await expect(
      crmLeadMutationRepository.updateStage({
        actor,
        fromStage: 'new',
        leadId: 'lead-1',
        stage: 'contacted',
      })
    ).resolves.toMatchObject({ stage: 'contacted' });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        changedById: 'agent-1',
        fromStage: 'new',
        leadId: 'lead-1',
        tenantId: 'tenant-1',
        toStage: 'contacted',
      })
    );
  });

  it('does not write stage history when the scoped update misses', async () => {
    mocks.updateReturning.mockResolvedValue([]);

    await expect(
      crmLeadMutationRepository.updateStage({
        actor,
        fromStage: 'new',
        leadId: 'lead-1',
        stage: 'contacted',
      })
    ).resolves.toBeNull();

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('fails closed before stage update SQL when actor branch scope is missing', async () => {
    await expect(
      crmLeadMutationRepository.updateStage({
        actor: { ...actor, scope: { agentId: 'agent-1' } },
        fromStage: 'new',
        leadId: 'lead-1',
        stage: 'contacted',
      })
    ).resolves.toBeNull();

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('writes the actor branch snapshot when recording manual CRM activity', async () => {
    mocks.insertReturning.mockResolvedValue([
      {
        agentId: 'agent-1',
        branchId: 'branch-original',
        completedAt: null,
        createdAt: new Date('2026-05-10T08:15:00.000Z'),
        description: null,
        id: 'activity-1',
        leadId: 'lead-1',
        occurredAt: new Date('2026-05-10T08:15:00.000Z'),
        scheduledAt: null,
        summary: 'Called lead',
        tenantId: 'tenant-1',
        type: 'call',
      },
    ]);

    await expect(
      crmLeadMutationRepository.recordActivity({
        actor,
        activity: {
          activityId: 'activity-1',
          actor,
          leadId: 'lead-1',
          occurredAt: '2026-05-10T08:15:00.000Z',
          summary: 'Called lead',
          type: 'call',
        },
      })
    ).resolves.toMatchObject({ branchId: 'branch-original', id: 'activity-1' });

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        branchId: 'branch-original',
        leadId: 'lead-1',
        tenantId: 'tenant-1',
        type: 'call',
      })
    );
  });

  it('fails closed before manual CRM activity insert when actor branch scope is missing', async () => {
    await expect(
      crmLeadMutationRepository.recordActivity({
        actor: { ...actor, scope: { agentId: 'agent-1' } },
        activity: {
          activityId: 'activity-1',
          actor,
          leadId: 'lead-1',
          occurredAt: '2026-05-10T08:15:00.000Z',
          summary: 'Called lead',
          type: 'call',
        },
      })
    ).rejects.toThrow('CRM activity creation requires actor branch scope');

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('transfers CRM lead ownership and rotates the open ownership history row atomically', async () => {
    mocks.updateReturning
      .mockResolvedValueOnce([leadRow({ agentId: 'agent-2', branchId: 'branch-original' })])
      .mockResolvedValueOnce([{ id: 'ownership-open-1' }]);

    await expect(
      crmLeadMutationRepository.transferOwnership({
        actor: { ...actor, actorId: 'staff-1', role: 'staff' },
        currentAgentId: 'agent-1',
        currentBranchId: 'branch-original',
        leadId: 'lead-1',
        reason: 'handover',
        targetAgentId: 'agent-2',
        targetBranchId: 'branch-original',
      })
    ).resolves.toMatchObject({ agentId: 'agent-2', branchId: 'branch-original' });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-2',
        branchId: 'branch-original',
        changedById: 'staff-1',
        leadId: 'lead-1',
        reason: 'handover',
        tenantId: 'tenant-1',
      })
    );
    expect(mocks.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          expect.objectContaining({
            op: 'isNull',
            value: expect.objectContaining({ name: 'ownershipEffectiveTo' }),
          }),
        ]),
      })
    );
  });

  it('does not append transfer ownership history when the scoped lead update misses', async () => {
    mocks.updateReturning.mockResolvedValue([]);

    await expect(
      crmLeadMutationRepository.transferOwnership({
        actor: { ...actor, actorId: 'staff-1', role: 'staff' },
        currentAgentId: 'agent-1',
        currentBranchId: 'branch-original',
        leadId: 'lead-1',
        reason: 'handover',
        targetAgentId: 'agent-2',
        targetBranchId: 'branch-original',
      })
    ).resolves.toBeNull();

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('rejects transfer before mutation when the target agent is outside the tenant or branch', async () => {
    mocks.userFindFirst.mockResolvedValueOnce(null);

    await expectTransferRejectedBeforeMutation({
      targetAgentId: 'agent-cross-tenant',
    });
  });

  it('rejects transfer before mutation when the target branch is outside the tenant', async () => {
    mocks.branchFindFirst.mockResolvedValueOnce(null);

    await expectTransferRejectedBeforeMutation({
      actor: { ...actor, actorId: 'admin-1', role: 'admin' },
      targetBranchId: 'branch-cross-tenant',
    });
  });

  it('rolls back transfer when there is no open ownership history row to close', async () => {
    mocks.updateReturning
      .mockResolvedValueOnce([leadRow({ agentId: 'agent-2', branchId: 'branch-original' })])
      .mockResolvedValueOnce([]);

    await expect(
      crmLeadMutationRepository.transferOwnership({
        actor: { ...actor, actorId: 'staff-1', role: 'staff' },
        currentAgentId: 'agent-1',
        currentBranchId: 'branch-original',
        leadId: 'lead-1',
        reason: 'handover',
        targetAgentId: 'agent-2',
        targetBranchId: 'branch-original',
      })
    ).resolves.toBeNull();

    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
