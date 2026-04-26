import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  branchFindFirstMock: vi.fn(),
  ensureTenantIdMock: vi.fn(() => 'tenant-1'),
  getMyCommissionSummaryMock: vi.fn(),
  getSessionMock: vi.fn(),
  getTranslationsMock: vi.fn(async () => (key: string) => key),
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  setRequestLocaleMock: vi.fn(),
  statsCoreMock: vi.fn(),
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

vi.mock('@interdomestik/database/db', () => ({
  db: {
    query: {
      branches: {
        findFirst: hoisted.branchFindFirstMock,
      },
    },
  },
}));

vi.mock('@/app/[locale]/(agent)/agent/_core', () => ({
  getAgentDashboardV2StatsCore: hoisted.statsCoreMock,
}));

vi.mock('@/actions/commissions', () => ({
  getMyCommissionSummary: hoisted.getMyCommissionSummaryMock,
}));

vi.mock('@/components/agent/agent-verified-id', () => ({
  AgentVerifiedID: () => null,
}));

vi.mock('@/components/agent/leaderboard-card', () => ({
  LeaderboardCard: () => null,
}));

vi.mock('@/components/agent/pipeline-chart', () => ({
  PipelineChart: () => null,
}));

vi.mock('@/components/agent/referral-link-card', () => ({
  ReferralLinkCard: () => null,
}));

vi.mock('@/components/dashboard/matte-anchor-card', () => ({
  MatteAnchorCard: () => null,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/lib/localize-seeded-branch-name', () => ({
  localizeSeededBranchName: (name: string) => name,
}));

vi.mock('@interdomestik/ui', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => children ?? null;
  return {
    Button: passthrough,
    Card: passthrough,
    CardContent: passthrough,
    CardDescription: passthrough,
    CardHeader: passthrough,
    CardTitle: passthrough,
  };
});

import { AgentDashboardV2Page } from './AgentDashboardV2Page';

describe('AgentDashboardV2Page tenant boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.ensureTenantIdMock.mockReturnValue('tenant-1');
    hoisted.getSessionMock.mockResolvedValue({
      user: {
        id: 'agent-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        name: 'Agent One',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    hoisted.statsCoreMock.mockResolvedValue({
      newLeads: 1,
      contactedLeads: 2,
      wonDeals: 3,
      totalPaidCommission: 4,
      clientCount: 5,
    });
    hoisted.branchFindFirstMock.mockResolvedValue({ name: 'Prishtina' });
    hoisted.getMyCommissionSummaryMock.mockResolvedValue({
      success: true,
      data: {
        totalPaid: 0,
        totalPending: 0,
        totalApproved: 0,
      },
    });
  });

  it('rejects missing tenant identity before loading dashboard stats', async () => {
    const session = {
      user: {
        id: 'agent-1',
        tenantId: null,
        branchId: null,
        name: 'Agent One',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    };
    hoisted.getSessionMock.mockResolvedValue(session);
    hoisted.ensureTenantIdMock.mockImplementationOnce(() => {
      throw new Error('Session missing tenantId. Data integrity issue.');
    });

    await expect(AgentDashboardV2Page({ locale: 'en', tier: 'pro' })).rejects.toThrow(
      'Session missing tenantId. Data integrity issue.'
    );

    expect(hoisted.ensureTenantIdMock).toHaveBeenCalledWith(session);
    expect(hoisted.statsCoreMock).not.toHaveBeenCalled();
    expect(hoisted.branchFindFirstMock).not.toHaveBeenCalled();
  });

  it('passes tenant identity into the v2 stats core on the authorized path', async () => {
    await AgentDashboardV2Page({ locale: 'en', tier: 'pro' });

    expect(hoisted.statsCoreMock).toHaveBeenCalledWith(
      { agentId: 'agent-1', tenantId: 'tenant-1' },
      expect.objectContaining({ db: expect.any(Object) })
    );
    const branchLookup = hoisted.branchFindFirstMock.mock.calls[0]?.[0];
    const andMock = vi.fn((...args: unknown[]) => ({ and: args }));
    const eqMock = vi.fn((field: unknown, value: unknown) => ({ eq: [field, value] }));

    expect(branchLookup.columns).toEqual({ name: true });
    expect(
      branchLookup.where(
        { id: 'branches.id', tenantId: 'branches.tenantId' },
        { and: andMock, eq: eqMock }
      )
    ).toEqual({
      and: [{ eq: ['branches.id', 'branch-1'] }, { eq: ['branches.tenantId', 'tenant-1'] }],
    });
  });
});
