import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('notFound');
  }),
  getSessionMock: vi.fn<
    () => Promise<{
      user: {
        branchId?: string | null;
        id: string;
        role?: string | null;
        tenantId: string | null;
      };
    } | null>
  >(async () => null),
  getTranslationsMock: vi.fn(async () => (key: string) => key),
  setRequestLocaleMock: vi.fn(),
  getFormatterMock: vi.fn(async () => ({
    number: vi.fn((val: number) => String(val)),
  })),
  ensureTenantIdMock: vi.fn(() => 'tenant-1'),
  getAgentCrmStatsCoreMock: vi.fn(),
  AgentCrmStatsAccessDeniedError: class AgentCrmStatsAccessDeniedError extends Error {
    constructor(readonly reason: string) {
      super(`CRM dashboard read denied: ${reason}`);
      this.name = 'AgentCrmStatsAccessDeniedError';
    }
  },
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  notFound: hoisted.notFoundMock,
  redirect: hoisted.redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.getTranslationsMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
  getFormatter: hoisted.getFormatterMock,
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
  AgentCrmStatsAccessDeniedError: hoisted.AgentCrmStatsAccessDeniedError,
  getAgentCrmStatsCore: hoisted.getAgentCrmStatsCoreMock,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({ asChild, children }: { asChild?: boolean; children: ReactNode }) =>
    asChild ? children : <button>{children}</button>,
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
      dueFollowUps: [],
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
    const session = {
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: null },
    };
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

  it('fails closed for non-agent sessions before loading CRM stats', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
    });

    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.notFoundMock).toHaveBeenCalled();
    expect(hoisted.ensureTenantIdMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmStatsCoreMock).not.toHaveBeenCalled();
  });

  it('fails closed for agent sessions without branch scope before loading CRM stats', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: null, id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });

    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.notFoundMock).toHaveBeenCalled();
    expect(hoisted.ensureTenantIdMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmStatsCoreMock).not.toHaveBeenCalled();
  });

  it('passes CRM actor context into the CRM stats core on the authorized path', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });

    await CRMPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    expect(hoisted.getAgentCrmStatsCoreMock).toHaveBeenCalledWith({
      actor: {
        actorId: 'agent-1',
        role: 'agent',
        scope: {
          agentId: 'agent-1',
          branchId: 'branch-1',
        },
        tenantId: 'tenant-1',
      },
    });
  });

  it('fails closed when the CRM stats core denies dashboard access', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getAgentCrmStatsCoreMock.mockRejectedValueOnce(
      new hoisted.AgentCrmStatsAccessDeniedError('branch_scope')
    );

    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.notFoundMock).toHaveBeenCalled();
  });
});
