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
      query: 'arta',
    });
    expect(data.attentionCount).toBe(1);
    expect(data.openClaimsTotal).toBe(3);
    expect(data.search).toBe('arta');
  });
});
