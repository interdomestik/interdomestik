import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

const mocks = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ args, op: 'and' })),
  crmLeadFindFirst: vi.fn(),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, op: 'eq', right })),
  insert: vi.fn(),
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
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
  sql: mocks.sql,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/database/schema', () => ({
  crmActivities: {
    agentId: { name: 'activityAgentId' },
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
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    execute: vi.fn(),
    insert: mocks.insert,
    query: {
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

beforeEach(() => {
  vi.clearAllMocks();

  mocks.insert.mockReturnValue({ values: mocks.insertValues });
  mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning });

  mocks.update.mockReturnValue({ set: mocks.updateSet });
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
  mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
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
});
