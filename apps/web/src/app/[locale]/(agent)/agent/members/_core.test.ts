import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('notFound');
  }),
  getSessionMock: vi.fn(),
  getAgentMembersListReadModelMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  notFound: hoisted.notFoundMock,
  redirect: hoisted.redirectMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@/features/agent/members/server/get-agent-members-read-model', () => ({
  getAgentMembersListReadModel: hoisted.getAgentMembersListReadModelMock,
}));

import { getAgentMembersPageData } from './_core';

describe('getAgentMembersPageData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionMock.mockResolvedValue({
      user: {
        id: 'agent-1',
        role: 'agent',
        tenantId: 'tenant-1',
      },
    });
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

  it('redirects unauthenticated users to the locale login path', async () => {
    hoisted.getSessionMock.mockResolvedValueOnce(null);

    await expect(getAgentMembersPageData({ locale: 'en' })).rejects.toThrow('redirect:/en/login');
  });

  it('returns not found for non-agent sessions', async () => {
    hoisted.getSessionMock.mockResolvedValueOnce({
      user: {
        id: 'staff-1',
        role: 'staff',
        tenantId: 'tenant-1',
      },
    });

    await expect(getAgentMembersPageData({ locale: 'en' })).rejects.toThrow('notFound');
  });

  it('loads members with trimmed search and summary counts', async () => {
    const data = await getAgentMembersPageData({
      locale: 'en',
      searchParams: { q: '  arta  ' },
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
