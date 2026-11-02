import { beforeEach, describe, expect, it, vi } from 'vitest';

import { actor, leadRow } from './lead-branch-ownership.test-support';

const mocks = await vi.hoisted(async () => {
  const { createOwnershipMocks } = await import('./lead-branch-ownership.test-support');
  return createOwnershipMocks();
});

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

vi.mock(
  '@interdomestik/database/schema',
  async () => (await import('./lead-branch-ownership.test-support')).schemaMock
);

vi.mock('@interdomestik/database', async () => {
  const { db } = await import('@interdomestik/database/db');
  mocks.withTenantContext.mockImplementation(
    async (_context: unknown, callback: (tx: unknown) => unknown) => callback(db)
  );
  return { withTenantContext: mocks.withTenantContext };
});

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
});
