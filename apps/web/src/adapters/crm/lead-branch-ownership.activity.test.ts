import { mocks, crmLeadMutationRepository } from './lead-branch-ownership.shared.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { actor, leadRow } from './lead-branch-ownership.test-support';

type TransferOwnershipParams = Parameters<typeof crmLeadMutationRepository.transferOwnership>[0];

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
