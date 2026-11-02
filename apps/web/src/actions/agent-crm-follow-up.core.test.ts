import { installAgentCrmFollowUpHooks } from './agent-crm-follow-up.core.hooks.test-support';
import { describe, expect, it, vi } from 'vitest';
import { activity, authority, lead, mocks, session } from './agent-crm-follow-up.core.test-support';
import {
  completeAgentLeadFollowUpCore,
  scheduleAgentLeadFollowUpCore,
} from './agent-crm-follow-up.core';

describe('agent CRM follow-up actions', () => {
  installAgentCrmFollowUpHooks();

  it('schedules a follow-up for an agent with tenant and branch scope', async () => {
    const result = await scheduleAgentLeadFollowUpCore({
      leadId: 'lead-1',
      scheduledAt: '2026-05-10T09:00:00.000Z',
      session: session(),
      authority,
      subject: 'Follow up',
    });

    expect(result.success).toBe(true);
    expect(mocks.createCrmLeadFollowUpRepository).toHaveBeenCalledWith(authority);
    expect(mocks.createCrmTaskCore.mock.calls[0]?.[0].authority).toBe(authority);
    expect(mocks.createCrmTaskCore).toHaveBeenCalledWith({
      authority,
      input: expect.objectContaining({
        assignedTo: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          kind: 'actor',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        createReasonCode: 'follow_up',
        dueAt: '2026-05-10T09:00:00.000Z',
        idempotencyKey: expect.stringMatching(/^lead-follow-up:schedule:/),
        priority: 'normal',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: expect.stringMatching(/^lead-follow-up:/),
      }),
      requestHeaders: undefined,
      session: expect.objectContaining({ user: expect.objectContaining({ id: 'agent-1' }) }),
    });
    expect(mocks.listCrmLeadFollowUpActivitiesForLead).toHaveBeenCalledWith({
      actor: expect.objectContaining({
        actorId: 'agent-1',
        scope: { agentId: 'agent-1', branchId: 'branch-1' },
        tenantId: 'tenant-1',
      }),
      authority,
      leadId: 'lead-1',
    });
    expect(mocks.createFollowUpActivity).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/agent/crm');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/agent/leads/lead-1');
  });

  it('rejects a missing tenant authority before any repository access', async () => {
    await expect(
      scheduleAgentLeadFollowUpCore({
        leadId: 'lead-1',
        scheduledAt: '2026-05-10T09:00:00.000Z',
        session: session(),
        authority: null,
        subject: 'Follow up',
      })
    ).resolves.toEqual({ success: false, error: 'unauthorized' });

    expect(mocks.createCrmLeadFollowUpRepository).not.toHaveBeenCalled();
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.createCrmTaskCore).not.toHaveBeenCalled();
  });

  it('rejects missing branch scope before repository writes', async () => {
    await expect(
      scheduleAgentLeadFollowUpCore({
        leadId: 'lead-1',
        scheduledAt: '2026-05-10T09:00:00.000Z',
        session: session({ branchId: null }),
        authority,
        subject: 'Follow up',
      })
    ).resolves.toEqual({ success: false, error: 'missing_branch_scope' });

    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.createFollowUpActivity).not.toHaveBeenCalled();
    expect(mocks.createCrmTaskCore).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('does not revalidate or write when domain authorization rejects another tenant, branch, or agent', async () => {
    for (const leakedLead of [
      lead({ tenantId: 'tenant-2' }),
      lead({ branchId: 'branch-2' }),
      lead({ agentId: 'agent-2' }),
    ]) {
      vi.clearAllMocks();
      mocks.findById.mockResolvedValueOnce(leakedLead);

      const result = await completeAgentLeadFollowUpCore({
        activityId: 'follow-up-1',
        leadId: 'lead-1',
        session: session(),
        authority,
      });

      expect(result.success).toBe(false);
      expect(mocks.completeFollowUpActivity).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    }
  });

  it('does not create a duplicate task when a matching legacy follow-up already exists', async () => {
    mocks.listCrmLeadFollowUpActivitiesForLead.mockResolvedValueOnce([
      activity({ scheduledAt: '2026-05-10T09:00:00.000Z' }),
    ]);

    const result = await scheduleAgentLeadFollowUpCore({
      leadId: 'lead-1',
      scheduledAt: '2026-05-10T09:00:00.000Z',
      session: session(),
      authority,
      subject: 'Sensitive free text must not enter task material',
    });

    expect(result.success).toBe(true);
    expect(mocks.createCrmTaskCore).not.toHaveBeenCalled();
    expect(mocks.createFollowUpActivity).not.toHaveBeenCalled();
  });

  it('completes an authorized open follow-up and revalidates agent CRM surfaces', async () => {
    const result = await completeAgentLeadFollowUpCore({
      activityId: 'follow-up-1',
      leadId: 'lead-1',
      session: session(),
      authority,
    });

    expect(result.success).toBe(true);
    expect(mocks.completeFollowUpActivity).toHaveBeenCalledWith({
      activityId: 'follow-up-1',
      actor: expect.objectContaining({ actorId: 'agent-1', tenantId: 'tenant-1' }),
      completedAt: expect.any(String),
      leadId: 'lead-1',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/agent/crm');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/agent/leads/lead-1');
  });
});
