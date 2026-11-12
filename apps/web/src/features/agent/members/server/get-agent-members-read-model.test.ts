import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAgentMembersList: vi.fn(),
}));

vi.mock('@interdomestik/domain-agent', () => ({
  getAgentMembersList: mocks.getAgentMembersList,
}));

import { getAgentMembersListReadModel } from './get-agent-members-read-model';

describe('getAgentMembersListReadModel', () => {
  const authority = mintTestTenantAuthority('tenant-1', { userId: 'agent-1', role: 'agent' });
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
      authority,
      query: 'Arben',
    });

    expect(mocks.getAgentMembersList).toHaveBeenCalledWith({
      agentId: 'agent-1',
      authority,
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
      authority,
    });

    expect(result).toEqual({ members: [] });
  });

  it('propagates domain role rejection without mapping', async () => {
    const failure = new Error('Forbidden: agent members list requires the agent role');
    mocks.getAgentMembersList.mockRejectedValueOnce(failure);

    await expect(
      getAgentMembersListReadModel({
        agentId: 'user-1',
        authority: mintTestTenantAuthority('tenant-1', { userId: 'user-1', role: 'member' }),
      })
    ).rejects.toBe(failure);
  });
});
