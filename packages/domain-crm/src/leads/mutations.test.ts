import { describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import type { CrmLead, CrmLeadActivity } from './types';
import {
  createCrmLead,
  recordCrmLeadActivity,
  updateCrmLeadStage,
  type CreateCrmLeadInput,
  type CrmLeadMutationRepository,
  type RecordCrmLeadActivityInput,
} from './mutations';

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function lead(overrides: Partial<CrmLead> = {}): CrmLead {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    createdAt: '2026-05-10T08:00:00.000Z',
    id: 'lead-1',
    source: 'manual',
    stage: 'new',
    tenantId: 'tenant-1',
    type: 'individual',
    updatedAt: '2026-05-10T08:00:00.000Z',
    ...overrides,
  };
}

function activity(overrides: Partial<CrmLeadActivity> = {}): CrmLeadActivity {
  return {
    agentId: 'agent-1',
    completedAt: null,
    createdAt: '2026-05-10T08:15:00.000Z',
    description: null,
    id: 'activity-1',
    leadId: 'lead-1',
    occurredAt: '2026-05-10T08:15:00.000Z',
    scheduledAt: null,
    subject: 'Called lead',
    tenantId: 'tenant-1',
    type: 'call',
    ...overrides,
  };
}

function createLeadInput(overrides: Partial<CreateCrmLeadInput> = {}): CreateCrmLeadInput {
  return {
    actor: agentActor,
    leadId: 'lead-1',
    stage: 'new',
    tenantId: 'tenant-1',
    type: 'individual',
    ...overrides,
  };
}

function recordActivityInput(
  overrides: Partial<RecordCrmLeadActivityInput> = {}
): RecordCrmLeadActivityInput {
  return {
    activityId: 'activity-1',
    actor: agentActor,
    leadId: 'lead-1',
    occurredAt: '2026-05-10T08:15:00.000Z',
    summary: 'Called lead',
    type: 'call',
    ...overrides,
  };
}

function repository(args: { lead?: CrmLead | null } = {}): CrmLeadMutationRepository {
  return {
    createLead: vi.fn(({ lead: created }) => Promise.resolve(lead({ ...created }))),
    findById: vi.fn().mockResolvedValue(args.lead === undefined ? lead() : args.lead),
    recordActivity: vi.fn(({ activity: recorded }) =>
      Promise.resolve(
        activity({
          id: recorded.activityId,
          leadId: recorded.leadId,
          occurredAt: recorded.occurredAt,
          subject: recorded.summary,
          type: recorded.type,
        })
      )
    ),
    updateStage: vi.fn(({ stage }) => Promise.resolve(lead({ stage }))),
  };
}

describe('CRM lead mutation domain boundary', () => {
  it('creates a lead for an explicit agent actor and tenant only', async () => {
    const repo = repository();

    await expect(
      createCrmLead(
        createLeadInput({
          fullName: 'Lead One',
          phone: '+38344123123',
          source: 'manual',
        }),
        repo
      )
    ).resolves.toMatchObject({ lead: { agentId: 'agent-1', tenantId: 'tenant-1' }, success: true });

    expect(repo.createLead).toHaveBeenCalledWith({
      actor: agentActor,
      lead: expect.objectContaining({ leadId: 'lead-1', stage: 'new', type: 'individual' }),
    });
    expect(repo.createLead).not.toHaveBeenCalledWith(
      expect.objectContaining({
        lead: expect.objectContaining({ actor: expect.anything(), tenantId: expect.anything() }),
      })
    );
  });

  it('suppresses create writes for wrong tenant, wrong role, wrong actor scope, wrong branch scope, and invalid stage', async () => {
    const wrongTenant = repository();
    await createCrmLead(
      createLeadInput({
        tenantId: 'tenant-2',
      }),
      wrongTenant
    );
    expect(wrongTenant.createLead).not.toHaveBeenCalled();

    const wrongRole = repository();
    await createCrmLead(
      createLeadInput({
        actor: { ...agentActor, role: 'staff' },
      }),
      wrongRole
    );
    expect(wrongRole.createLead).not.toHaveBeenCalled();

    const wrongActorScope = repository();
    await createCrmLead(
      createLeadInput({
        actor: { ...agentActor, scope: { ...agentActor.scope, agentId: 'agent-2' } },
      }),
      wrongActorScope
    );
    expect(wrongActorScope.createLead).not.toHaveBeenCalled();

    const wrongBranchScope = repository();
    await createCrmLead(
      createLeadInput({
        actor: { ...agentActor, scope: { ...agentActor.scope, branchId: undefined } },
      }),
      wrongBranchScope
    );
    expect(wrongBranchScope.createLead).not.toHaveBeenCalled();

    const invalidStage = repository();
    await createCrmLead(
      createLeadInput({
        stage: 'active',
      }),
      invalidStage
    );
    expect(invalidStage.createLead).not.toHaveBeenCalled();
  });

  it('updates lead stage only for the assigned agent in matching tenant and branch', async () => {
    const repo = repository();

    await expect(
      updateCrmLeadStage({ actor: agentActor, leadId: 'lead-1', stage: 'contacted' }, repo)
    ).resolves.toMatchObject({ lead: { stage: 'contacted' }, success: true });

    expect(repo.updateStage).toHaveBeenCalledWith({
      actor: agentActor,
      leadId: 'lead-1',
      stage: 'contacted',
    });
  });

  it('suppresses stage writes for wrong tenant, wrong role, wrong agent, and wrong branch', async () => {
    for (const [leadOverride, actorOverride] of [
      [{ tenantId: 'tenant-2' }, {}],
      [{}, { role: 'staff' as const }],
      [{ agentId: 'agent-2' }, {}],
      [{ branchId: 'branch-2' }, {}],
      [{ branchId: null }, {}],
    ] as const) {
      const repo = repository({ lead: lead(leadOverride) });
      await updateCrmLeadStage(
        { actor: { ...agentActor, ...actorOverride }, leadId: 'lead-1', stage: 'contacted' },
        repo
      );
      expect(repo.updateStage).not.toHaveBeenCalled();
    }
  });

  it('records lead activity as a write-side event source for timeline reads after authorization', async () => {
    const repo = repository();

    await expect(recordCrmLeadActivity(recordActivityInput(), repo)).resolves.toMatchObject({
      activity: { id: 'activity-1' },
      success: true,
    });

    expect(repo.recordActivity).toHaveBeenCalled();
  });

  it('suppresses activity writes for missing and unauthorized leads', async () => {
    for (const [current, actorOverride] of [
      [null, {}],
      [lead({ tenantId: 'tenant-2' }), {}],
      [lead(), { role: 'staff' as const }],
      [lead({ agentId: 'agent-2' }), {}],
      [lead({ branchId: 'branch-2' }), {}],
      [lead({ branchId: null }), {}],
    ] as const) {
      const repo = repository({ lead: current });
      await recordCrmLeadActivity(
        recordActivityInput({
          actor: { ...agentActor, ...actorOverride },
        }),
        repo
      );
      expect(repo.recordActivity).not.toHaveBeenCalled();
    }
  });

  it('suppresses activity writes for unsupported activity types before repository reads', async () => {
    const repo = repository();

    await expect(
      recordCrmLeadActivity(
        recordActivityInput({
          type: 'follow_up',
        }),
        repo
      )
    ).resolves.toEqual({
      error: 'invalid_input',
      reason: 'invalid_activity_type',
      success: false,
    });

    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.recordActivity).not.toHaveBeenCalled();
  });

  it('suppresses activity writes for invalid timestamps before repository reads', async () => {
    const repo = repository();

    await expect(
      recordCrmLeadActivity(
        recordActivityInput({
          occurredAt: 'not-a-date',
        }),
        repo
      )
    ).resolves.toEqual({
      error: 'invalid_input',
      reason: 'invalid_occurred_at',
      success: false,
    });

    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.recordActivity).not.toHaveBeenCalled();
  });
});
