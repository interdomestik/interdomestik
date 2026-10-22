import { describe, expect, it } from 'vitest';
import { mocks, actor, leadRow } from './lead-branch-ownership-test-setup';
import { crmLeadMutationRepository } from './lead-mutation-repository';
import { crmLeadFollowUpRepository } from './lead-follow-up-repository';

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
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: actor.tenantId },
      expect.any(Function)
    );

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
});
