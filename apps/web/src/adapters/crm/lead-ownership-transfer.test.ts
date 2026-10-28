import { describe, expect, it } from 'vitest';
import {
  mocks,
  actor,
  leadRow,
  expectTransferRejectedBeforeMutation,
} from './lead-branch-ownership-test-setup';
import { crmLeadMutationRepository } from './lead-mutation-repository';

describe('CRM durable lead ownership transfer repositories', () => {
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
