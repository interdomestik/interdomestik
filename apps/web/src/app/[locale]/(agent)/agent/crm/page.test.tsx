import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  getSessionMock: vi.fn<() => Promise<{ user: { id: string; tenantId: string | null } } | null>>(
    async () => null
  ),
  getTranslationsMock: vi.fn(async () => (key: string) => key),
  setRequestLocaleMock: vi.fn(),
  ensureTenantIdMock: vi.fn(() => 'tenant-1'),
  getAgentCrmStatsCoreMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.getTranslationsMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantIdMock,
}));

vi.mock('./_core', () => ({
  getAgentCrmStatsCore: hoisted.getAgentCrmStatsCoreMock,
}));

vi.mock('@/components/agent/leaderboard-card', () => ({
  LeaderboardCard: () => null,
}));

vi.mock('@/components/agent/pipeline-chart', () => ({
  PipelineChart: () => null,
}));

import CRMPage from './page';

describe('CRMPage auth redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionMock.mockResolvedValue(null);
    hoisted.ensureTenantIdMock.mockReturnValue('tenant-1');
    hoisted.getAgentCrmStatsCoreMock.mockResolvedValue({
      newLeadsCount: 0,
      contactedLeadsCount: 0,
      closedWonDealsCount: 0,
      paidCommissionTotal: 0,
    });
  });

  it('redirects unauthenticated users to the locale login path', async () => {
    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('redirect:/en/login');
  });

  it('rejects a session with missing tenant identity before loading CRM stats', async () => {
    const session = { user: { id: 'agent-1', tenantId: null } };
    hoisted.getSessionMock.mockResolvedValue(session);
    hoisted.ensureTenantIdMock.mockImplementationOnce(() => {
      throw new Error('Session missing tenantId. Data integrity issue.');
    });

    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('Session missing tenantId. Data integrity issue.');

    expect(hoisted.ensureTenantIdMock).toHaveBeenCalledWith(session);
    expect(hoisted.getAgentCrmStatsCoreMock).not.toHaveBeenCalled();
  });

  it('passes tenant identity into the CRM stats core on the authorized path', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { id: 'agent-1', tenantId: 'tenant-1' },
    });

    await CRMPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    expect(hoisted.getAgentCrmStatsCoreMock).toHaveBeenCalledWith({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
    });
  });
});
