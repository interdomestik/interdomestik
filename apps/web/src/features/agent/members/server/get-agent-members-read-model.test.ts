import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAgentMembersList: vi.fn(),
  authorize: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionUserTenant: mocks.authorize }));

vi.mock('@interdomestik/domain-agent', () => ({
  getAgentMembersList: mocks.getAgentMembersList,
}));

import { getAgentMembersListReadModel } from './get-agent-members-read-model';

const authority = mintTestTenantAuthority('tenant-1', { userId: 'agent-1', role: 'agent' });
describe('getAgentMembersListReadModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue(authority);
  });
  it('refuses stale tenant and missing session before calling the domain reader', async () => {
    await expect(
      getAgentMembersListReadModel({ agentId: 'agent-1', tenantId: 'other', role: 'agent' })
    ).rejects.toThrow('Forbidden');
    mocks.authorize.mockResolvedValueOnce(null);
    await expect(
      getAgentMembersListReadModel({ agentId: 'agent-1', tenantId: 'tenant-1', role: 'agent' })
    ).rejects.toThrow('Forbidden');
    expect(mocks.getAgentMembersList).not.toHaveBeenCalled();
  });

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
      role: 'agent',
      query: 'Arben',
    });

    expect(mocks.getAgentMembersList).toHaveBeenCalledWith({
      authority,
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      role: 'agent',
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
    mocks.authorize.mockResolvedValueOnce(
      mintTestTenantAuthority('tenant-2', { userId: 'agent-2', role: 'agent' })
    );
    mocks.getAgentMembersList.mockResolvedValue({ members: [] });

    const result = await getAgentMembersListReadModel({
      agentId: 'agent-2',
      tenantId: 'tenant-2',
      role: 'agent',
    });

    expect(result).toEqual({ members: [] });
  });

  it('propagates domain role rejection without mapping', async () => {
    mocks.authorize.mockResolvedValueOnce(
      mintTestTenantAuthority('tenant-1', { userId: 'user-1', role: 'member' })
    );
    const failure = new Error('Forbidden: agent members list requires the agent role');
    mocks.getAgentMembersList.mockRejectedValueOnce(failure);

    await expect(
      getAgentMembersListReadModel({ agentId: 'user-1', tenantId: 'tenant-1', role: 'member' })
    ).rejects.toBe(failure);
  });
});
