import { installAgentCrmFollowUpHooks } from './agent-crm-follow-up.core.hooks.test-support';
import { describe, expect, it } from 'vitest';
import { activity, authority, mocks, session } from './agent-crm-follow-up.core.test-support';
import { completeAgentLeadFollowUpCore } from './agent-crm-follow-up.core';

describe('agent CRM follow-up actions', () => {
  installAgentCrmFollowUpHooks();

  it('completes task-backed follow-ups through the CRM task boundary', async () => {
    const result = await completeAgentLeadFollowUpCore({
      activityId: 'lead-follow-up-task-1',
      expectedLifecycleVersion: 1,
      leadId: 'lead-1',
      session: session(),
      authority,
      source: 'crm_task',
    });

    expect(result.success).toBe(true);
    expect(mocks.listCrmLeadFollowUpTasksForLead).toHaveBeenCalledWith({
      actor: expect.objectContaining({
        actorId: 'agent-1',
        scope: { agentId: 'agent-1', branchId: 'branch-1' },
        tenantId: 'tenant-1',
      }),
      authority,
      leadId: 'lead-1',
    });
    expect(mocks.completeCrmTaskCore.mock.calls[0]?.[0].authority).toBe(authority);
    expect(mocks.completeCrmTaskCore).toHaveBeenCalledWith({
      authority,
      input: {
        expectedLifecycleVersion: 1,
        reasonCode: 'resolved',
        taskId: 'lead-follow-up-task-1',
      },
      requestHeaders: undefined,
      session: expect.objectContaining({ user: expect.objectContaining({ id: 'agent-1' }) }),
    });
    expect(mocks.completeFollowUpActivity).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/agent/leads/lead-1');
  });

  it('rejects task-backed completion when the task is not a visible follow-up for the submitted lead', async () => {
    mocks.listCrmLeadFollowUpTasksForLead.mockResolvedValueOnce([]);

    const result = await completeAgentLeadFollowUpCore({
      activityId: 'other-task-1',
      expectedLifecycleVersion: 1,
      leadId: 'lead-1',
      session: session(),
      authority,
      source: 'crm_task',
    });

    expect(result).toEqual({ success: false, error: 'not_found' });
    expect(mocks.completeCrmTaskCore).not.toHaveBeenCalled();
    expect(mocks.completeFollowUpActivity).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects task-backed completion when the submitted lifecycle version is stale', async () => {
    const result = await completeAgentLeadFollowUpCore({
      activityId: 'lead-follow-up-task-1',
      expectedLifecycleVersion: 2,
      leadId: 'lead-1',
      session: session(),
      authority,
      source: 'crm_task',
    });

    expect(result).toEqual({ success: false, error: 'conflict', reason: 'lifecycle_conflict' });
    expect(mocks.completeCrmTaskCore).not.toHaveBeenCalled();
    expect(mocks.completeFollowUpActivity).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('completes a same-time legacy duplicate after task-backed completion', async () => {
    mocks.listCrmLeadFollowUpActivitiesForLead.mockResolvedValueOnce([
      activity({ id: 'legacy-shadow-1', scheduledAt: '2026-05-10T09:00:00.000Z' }),
    ]);

    const result = await completeAgentLeadFollowUpCore({
      activityId: 'lead-follow-up-task-1',
      expectedLifecycleVersion: 1,
      leadId: 'lead-1',
      session: session(),
      authority,
      source: 'crm_task',
    });

    expect(result.success).toBe(true);
    expect(mocks.completeFollowUpActivity).toHaveBeenCalledWith({
      activityId: 'legacy-shadow-1',
      actor: expect.objectContaining({ actorId: 'agent-1', tenantId: 'tenant-1' }),
      completedAt: expect.any(String),
      leadId: 'lead-1',
    });
  });
});
