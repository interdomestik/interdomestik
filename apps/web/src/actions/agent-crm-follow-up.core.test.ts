import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeFollowUpActivity: vi.fn(),
  completeCrmTaskCore: vi.fn(),
  createCrmTaskCore: vi.fn(),
  createFollowUpActivity: vi.fn(),
  findById: vi.fn(),
  listCrmLeadFollowUpActivitiesForLead: vi.fn(),
  listCrmLeadFollowUpTasksForLead: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/adapters/crm/lead-follow-up-repository', () => ({
  crmLeadFollowUpRepository: {
    completeFollowUpActivity: mocks.completeFollowUpActivity,
    createFollowUpActivity: mocks.createFollowUpActivity,
    findById: mocks.findById,
  },
  listCrmLeadFollowUpActivitiesForLead: mocks.listCrmLeadFollowUpActivitiesForLead,
  listCrmLeadFollowUpTasksForLead: mocks.listCrmLeadFollowUpTasksForLead,
}));

vi.mock('./crm-tasks.core', () => ({
  completeCrmTaskCore: mocks.completeCrmTaskCore,
  createCrmTaskCore: mocks.createCrmTaskCore,
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'follow-up-1',
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

import {
  completeAgentLeadFollowUpCore,
  scheduleAgentLeadFollowUpCore,
} from './agent-crm-follow-up.core';

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      branchId: 'branch-1',
      id: 'agent-1',
      role: 'agent',
      tenantId: 'tenant-1',
      ...overrides,
    },
  };
}

function lead(overrides: Record<string, unknown> = {}) {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    createdAt: '2026-05-10T08:00:00.000Z',
    id: 'lead-1',
    stage: 'new',
    tenantId: 'tenant-1',
    type: 'individual',
    ...overrides,
  };
}

function activity(overrides: Record<string, unknown> = {}) {
  return {
    agentId: 'agent-1',
    completedAt: null,
    createdAt: '2026-05-10T08:00:00.000Z',
    description: null,
    id: 'follow-up-1',
    leadId: 'lead-1',
    occurredAt: '2026-05-10T08:00:00.000Z',
    scheduledAt: '2026-05-10T09:00:00.000Z',
    subject: 'Follow up',
    tenantId: 'tenant-1',
    type: 'follow_up',
    ...overrides,
  };
}

describe('agent CRM follow-up actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(lead());
    mocks.createFollowUpActivity.mockImplementation(async ({ activity: created }) =>
      activity({ ...created, agentId: 'agent-1' })
    );
    mocks.listCrmLeadFollowUpActivitiesForLead.mockResolvedValue([]);
    mocks.listCrmLeadFollowUpTasksForLead.mockResolvedValue([
      activity({
        expectedLifecycleVersion: 1,
        followUpSource: 'crm_task',
        id: 'lead-follow-up-task-1',
        scheduledAt: '2026-05-10T09:00:00.000Z',
      }),
    ]);
    mocks.createCrmTaskCore.mockResolvedValue({
      outcome: 'success',
      task: {
        assignedTo: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          kind: 'actor',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        branchId: 'branch-1',
        completedAt: null,
        createReasonCode: 'follow_up',
        createdAt: '2026-05-10T08:00:00.000Z',
        createdBy: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        dueAt: '2026-05-10T09:00:00.000Z',
        lifecycleVersion: 1,
        status: 'pending',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: 'lead-follow-up-task-1',
        tenantId: 'tenant-1',
      },
      transition: null,
    });
    mocks.completeCrmTaskCore.mockResolvedValue({
      outcome: 'success',
      task: {
        assignedTo: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          kind: 'actor',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        branchId: 'branch-1',
        completedAt: '2026-05-10T09:30:00.000Z',
        createReasonCode: 'follow_up',
        createdAt: '2026-05-10T08:00:00.000Z',
        createdBy: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          role: 'agent',
          tenantId: 'tenant-1',
        },
        dueAt: '2026-05-10T09:00:00.000Z',
        lifecycleVersion: 2,
        status: 'completed',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: 'lead-follow-up-task-1',
        tenantId: 'tenant-1',
      },
      transition: null,
    });
    mocks.completeFollowUpActivity.mockResolvedValue(
      activity({ completedAt: '2026-05-10T09:30:00.000Z' })
    );
  });

  it('schedules a follow-up for an agent with tenant and branch scope', async () => {
    const result = await scheduleAgentLeadFollowUpCore({
      leadId: 'lead-1',
      scheduledAt: '2026-05-10T09:00:00.000Z',
      session: session(),
      subject: 'Follow up',
    });

    expect(result.success).toBe(true);
    expect(mocks.createCrmTaskCore).toHaveBeenCalledWith({
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
      leadId: 'lead-1',
    });
    expect(mocks.createFollowUpActivity).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/agent/crm');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/agent/leads/lead-1');
  });

  it('rejects missing branch scope before repository writes', async () => {
    await expect(
      scheduleAgentLeadFollowUpCore({
        leadId: 'lead-1',
        scheduledAt: '2026-05-10T09:00:00.000Z',
        session: session({ branchId: null }),
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

  it('completes task-backed follow-ups through the CRM task boundary', async () => {
    const result = await completeAgentLeadFollowUpCore({
      activityId: 'lead-follow-up-task-1',
      expectedLifecycleVersion: 1,
      leadId: 'lead-1',
      session: session(),
      source: 'crm_task',
    });

    expect(result.success).toBe(true);
    expect(mocks.listCrmLeadFollowUpTasksForLead).toHaveBeenCalledWith({
      actor: expect.objectContaining({
        actorId: 'agent-1',
        scope: { agentId: 'agent-1', branchId: 'branch-1' },
        tenantId: 'tenant-1',
      }),
      leadId: 'lead-1',
    });
    expect(mocks.completeCrmTaskCore).toHaveBeenCalledWith({
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
