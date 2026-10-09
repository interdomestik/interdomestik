import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getAgentMembersListReadModelMock: vi.fn(),
}));

vi.mock('@/features/agent/members/server/get-agent-members-read-model', () => ({
  getAgentMembersListReadModel: hoisted.getAgentMembersListReadModelMock,
}));

import { getAgentMembersPageData } from './_core';

describe('getAgentMembersPageData', () => {
  const agentSession = {
    user: {
      id: 'agent-1',
      role: 'agent',
      tenantId: 'tenant-1',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getAgentMembersListReadModelMock.mockResolvedValue({
      members: [
        {
          memberId: 'member-1',
          attentionState: 'needs_attention',
          openClaimsCount: 2,
        },
        {
          memberId: 'member-2',
          attentionState: 'up_to_date',
          openClaimsCount: 1,
        },
      ],
    });
  });

  it('loads members with trimmed search and summary counts', async () => {
    const data = await getAgentMembersPageData({
      searchParams: { q: '  arta  ' },
      session: agentSession,
    });

    expect(hoisted.getAgentMembersListReadModelMock).toHaveBeenCalledWith({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      role: 'agent',
      query: 'arta',
    });
    expect(data.attentionCount).toBe(1);
    expect(data.openClaimsTotal).toBe(3);
    expect(data.search).toBe('arta');
  });

  it('forwards the effective access tenant when it diverges from the home tenant', async () => {
    await getAgentMembersPageData({
      session: {
        user: { id: 'agent-1', role: 'agent', tenantId: 'tenant_ks', accessTenantId: 'tenant_mk' },
      },
    });

    expect(hoisted.getAgentMembersListReadModelMock).toHaveBeenCalledWith({
      agentId: 'agent-1',
      tenantId: 'tenant_mk',
      role: 'agent',
      query: undefined,
    });
  });

  it('forwards the actual session role instead of assuming agent', async () => {
    await getAgentMembersPageData({
      session: { user: { id: 'user-9', role: 'member', tenantId: 'tenant-1' } },
    });

    expect(hoisted.getAgentMembersListReadModelMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'user-9', role: 'member' })
    );
  });

  it('fails before reading when the session has no tenant', async () => {
    await expect(
      getAgentMembersPageData({ session: { user: { id: 'agent-1', role: 'agent' } } })
    ).rejects.toThrow();

    expect(hoisted.getAgentMembersListReadModelMock).not.toHaveBeenCalled();
  });
});
