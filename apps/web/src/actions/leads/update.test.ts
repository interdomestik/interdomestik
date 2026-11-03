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

import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

import { updateLeadStatusAction } from './update';

const authority = mintTestTenantAuthority('tenant-1');

function updateActionContext(options: { branchId?: string | null } = {}) {
  const branchId = options.branchId === undefined ? 'branch-1' : options.branchId;

  return {
    authority,
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
  it('passes the tenant authority, agent, and branch scope into the lead status update', async () => {
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
        authority,
        branchId: 'branch-1',
        leadId: 'lead-1',
      },
      status: 'contacted',
    });
    // Opaque tokens deep-compare as {}; assert the exact session token is forwarded.
    expect(hoisted.updateScopedAgentLeadStatus.mock.calls[0][0].scope.authority).toBe(authority);
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
