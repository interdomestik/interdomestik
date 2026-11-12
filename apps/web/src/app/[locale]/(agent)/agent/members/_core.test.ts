import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getAgentMembersListReadModelMock: vi.fn(),
}));

vi.mock('@/features/agent/members/server/get-agent-members-read-model', () => ({
  getAgentMembersListReadModel: hoisted.getAgentMembersListReadModelMock,
}));

import { getAgentMembersPageData } from './_core';

describe('getAgentMembersPageData', () => {
  const authority = mintTestTenantAuthority('tenant-1', { userId: 'agent-1', role: 'agent' });

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getAgentMembersListReadModelMock.mockResolvedValue({
      members: [
        { memberId: 'member-1', attentionState: 'needs_attention', openClaimsCount: 2 },
        { memberId: 'member-2', attentionState: 'up_to_date', openClaimsCount: 1 },
      ],
    });
  });

  it('loads members with trimmed search and summary counts', async () => {
    const data = await getAgentMembersPageData({ searchParams: { q: '  arta  ' }, authority });

    expect(hoisted.getAgentMembersListReadModelMock).toHaveBeenCalledWith({
      agentId: 'agent-1',
      authority,
      query: 'arta',
    });
    expect(data.attentionCount).toBe(1);
    expect(data.openClaimsTotal).toBe(3);
    expect(data.search).toBe('arta');
  });

  it('forwards the same effective access-tenant capability without rebuilding it', async () => {
    const effectiveAuthority = mintTestTenantAuthority('tenant_mk', {
      accessTenantId: 'tenant_mk',
      userId: 'agent-1',
      role: 'agent',
    });
    await getAgentMembersPageData({ authority: effectiveAuthority });

    expect(hoisted.getAgentMembersListReadModelMock).toHaveBeenCalledWith({
      agentId: 'agent-1',
      authority: effectiveAuthority,
      query: undefined,
    });
  });

  it('forwards the actual session principal instead of assuming an agent role', async () => {
    const memberAuthority = mintTestTenantAuthority('tenant-1', {
      userId: 'user-9',
      role: 'member',
    });
    await getAgentMembersPageData({ authority: memberAuthority });

    expect(hoisted.getAgentMembersListReadModelMock).toHaveBeenCalledWith({
      agentId: 'user-9',
      authority: memberAuthority,
      query: undefined,
    });
  });

  it.each([{} as TenantAuthority, mintTestTenantAuthority('tenant-1')])(
    'fails before reading without a registered session principal',
    async invalidAuthority => {
      await expect(getAgentMembersPageData({ authority: invalidAuthority })).rejects.toThrow();
      expect(hoisted.getAgentMembersListReadModelMock).not.toHaveBeenCalled();
    }
  );
});
