import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  runAuthenticatedAction: vi.fn(),
  updateScopedAgentLeadStatus: vi.fn(),
}));

vi.mock('@/lib/safe-action', () => ({
  runAuthenticatedAction: hoisted.runAuthenticatedAction,
}));

vi.mock('@/features/agent/leads/server/lead-actions', () => ({
  updateScopedAgentLeadStatus: hoisted.updateScopedAgentLeadStatus,
}));

import { updateLeadStatusAction } from './update';

function updateActionContext(options: { branchId?: string | null } = {}) {
  const branchId = options.branchId === undefined ? 'branch-1' : options.branchId;

  return {
    tenantId: 'tenant-1',
    userRole: 'agent',
    scope: {
      actorAgentId: 'agent-1',
      attributedAgentId: null,
      branchId,
    },
    session: {
      user: {
        tenantId: 'tenant-1',
        role: 'agent',
        id: 'agent-1',
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.runAuthenticatedAction.mockImplementation(async callback =>
    callback(updateActionContext())
  );
  hoisted.updateScopedAgentLeadStatus.mockResolvedValue({ success: true });
});

describe('updateLeadStatusAction', () => {
  it('passes tenant, agent, and branch scope into the lead status update', async () => {
    await expect(
      updateLeadStatusAction({
        leadId: 'lead-1',
        notes: 'left voicemail',
        status: 'contacted',
      })
    ).resolves.toEqual({ success: true });

    expect(hoisted.updateScopedAgentLeadStatus).toHaveBeenCalledWith({
      notes: 'left voicemail',
      scope: {
        agentId: 'agent-1',
        branchId: 'branch-1',
        leadId: 'lead-1',
        tenantId: 'tenant-1',
      },
      status: 'contacted',
    });
  });

  it('rejects callers without agent branch scope before lead mutation', async () => {
    hoisted.runAuthenticatedAction.mockImplementationOnce(async callback =>
      callback(updateActionContext({ branchId: null }))
    );

    await expect(
      updateLeadStatusAction({
        leadId: 'lead-1',
        status: 'contacted',
      })
    ).rejects.toThrow(/unauthorized/i);
    expect(hoisted.updateScopedAgentLeadStatus).not.toHaveBeenCalled();
  });
});
