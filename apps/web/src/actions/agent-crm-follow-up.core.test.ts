import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeFollowUpActivity: vi.fn(),
  createFollowUpActivity: vi.fn(),
  findById: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/adapters/crm/lead-follow-up-repository', () => ({
  crmLeadFollowUpRepository: {
    completeFollowUpActivity: mocks.completeFollowUpActivity,
    createFollowUpActivity: mocks.createFollowUpActivity,
    findById: mocks.findById,
  },
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
    expect(mocks.findById).toHaveBeenCalledWith({
      actor: expect.objectContaining({
        actorId: 'agent-1',
        scope: { agentId: 'agent-1', branchId: 'branch-1' },
        tenantId: 'tenant-1',
      }),
      leadId: 'lead-1',
    });
    expect(mocks.createFollowUpActivity).toHaveBeenCalled();
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
});
