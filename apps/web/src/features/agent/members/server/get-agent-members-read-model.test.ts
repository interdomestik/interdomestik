import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAgentMembersList: vi.fn(),
}));

vi.mock('@interdomestik/domain-agent', () => ({
  getAgentMembersList: mocks.getAgentMembersList,
}));

import { getAgentMembersListReadModel } from './get-agent-members-read-model';

describe('getAgentMembersListReadModel', () => {
  it('maps domain payload to read-model contract', async () => {
    mocks.getAgentMembersList.mockResolvedValue({
      members: [
        {
          memberId: 'member-1',
          name: 'Arben Krasniqi',
          membershipNumber: 'MEM-2026-000002',
          openClaimsCount: 2,
          activeClaimsCount: 2,
          attentionState: 'needs_attention',
          lastUpdatedAt: '2026-02-07T10:00:00.000Z',
        },
      ],
    });

    const result = await getAgentMembersListReadModel({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      query: 'Arben',
    });

    expect(mocks.getAgentMembersList).toHaveBeenCalledWith({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      query: 'Arben',
    });
    expect(result).toEqual({
      members: [
        {
          memberId: 'member-1',
          name: 'Arben Krasniqi',
          memberNumber: 'MEM-2026-000002',
          openClaimsCount: 2,
          attentionState: 'needs_attention',
        },
      ],
    });
  });

  it('preserves empty list shape', async () => {
    mocks.getAgentMembersList.mockResolvedValue({ members: [] });

    const result = await getAgentMembersListReadModel({
      agentId: 'agent-2',
      tenantId: 'tenant-2',
    });

    expect(result).toEqual({ members: [] });
  });
});
