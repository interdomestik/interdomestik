import { render, screen } from '@testing-library/react';
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
  refreshMock: vi.fn(),
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
  getAgentCrmTaskQueueCoreMock: vi.fn(),
  AgentCrmStatsAccessDeniedError: class AgentCrmStatsAccessDeniedError extends Error {
    constructor(readonly reason: string) {
      super(`CRM dashboard read denied: ${reason}`);
      this.name = 'AgentCrmStatsAccessDeniedError';
    }
  },
  AgentCrmReportingAccessDeniedError: class AgentCrmReportingAccessDeniedError extends Error {
    constructor(readonly reason: string) {
      super(`CRM reporting read denied: ${reason}`);
      this.name = 'AgentCrmReportingAccessDeniedError';
    }
  },
  getAgentCrmReportingCoreMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  notFound: hoisted.notFoundMock,
  redirect: hoisted.redirectMock,
  useRouter: () => ({
    refresh: hoisted.refreshMock,
  }),
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
  AgentCrmReportingAccessDeniedError: hoisted.AgentCrmReportingAccessDeniedError,
  AgentCrmStatsAccessDeniedError: hoisted.AgentCrmStatsAccessDeniedError,
  getAgentCrmReportingCore: hoisted.getAgentCrmReportingCoreMock,
  getAgentCrmStatsCore: hoisted.getAgentCrmStatsCoreMock,
  getAgentCrmTaskQueueCore: hoisted.getAgentCrmTaskQueueCoreMock,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: {
    asChild?: boolean;
    children: ReactNode;
    [key: string]: unknown;
  }) => (asChild ? children : <button {...props}>{children}</button>),
}));

vi.mock('@/components/agent/leaderboard-card', () => ({
  LeaderboardCard: () => null,
}));

vi.mock('@/components/agent/pipeline-chart', () => ({
  PipelineChart: () => null,
}));

vi.mock('@/components/crm/charts/reporting-chart-boundary', () => ({
  PipelineAmountChartBoundary: ({ title }: { title: string }) => (
    <div data-testid="crm-reporting-chart-pipeline-amount">{title}</div>
  ),
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
    hoisted.getAgentCrmReportingCoreMock.mockResolvedValue({
      sourceBreakdown: {
        excludedMissingCurrencyCount: 0,
        excludedMissingValueCount: 0,
        groups: [],
      },
      weightedPipeline: {
        currencySummaries: [],
        excludedRowCount: 0,
      },
      winRateBySource: {
        groups: [],
      },
      window: {
        from: '2026-02-13T12:00:00.000Z',
        to: '2026-05-14T12:00:00.000Z',
      },
    });
    hoisted.getAgentCrmTaskQueueCoreMock.mockResolvedValue([]);
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
    expect(hoisted.getAgentCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmTaskQueueCoreMock).not.toHaveBeenCalled();
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
    expect(hoisted.getAgentCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmTaskQueueCoreMock).not.toHaveBeenCalled();
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
    expect(hoisted.getAgentCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmTaskQueueCoreMock).not.toHaveBeenCalled();
  });

  it('passes CRM actor context into the CRM stats and reporting cores on the authorized path', async () => {
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
    expect(hoisted.getAgentCrmReportingCoreMock).toHaveBeenCalledWith({
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
    expect(hoisted.getAgentCrmTaskQueueCoreMock).toHaveBeenCalledWith({
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

  it('fails closed when the CRM reporting core denies dashboard access', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getAgentCrmReportingCoreMock.mockRejectedValueOnce(
      new hoisted.AgentCrmReportingAccessDeniedError('agent_scope')
    );

    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.notFoundMock).toHaveBeenCalled();
  });

  it('renders CRM12 reporting widget markers and empty states', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });

    render(
      await CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    );

    expect(screen.getByTestId('agent-crm-page-ready')).toBeTruthy();
    expect(screen.getByTestId('agent-crm-task-queue-ready')).toHaveTextContent(
      'crm.taskQueue.empty'
    );
    expect(screen.getByTestId('agent-crm-reporting-weighted-pipeline')).toHaveTextContent(
      'reporting.weightedPipeline.empty'
    );
    expect(screen.getByTestId('agent-crm-reporting-source-breakdown')).toHaveTextContent(
      'reporting.sourceBreakdown.empty'
    );
    expect(screen.getByTestId('agent-crm-reporting-win-rate')).toHaveTextContent(
      'reporting.winRate.empty'
    );
  });

  it('renders multi-currency pipeline and source metrics without charts', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getAgentCrmReportingCoreMock.mockResolvedValueOnce({
      sourceBreakdown: {
        excludedMissingCurrencyCount: 0,
        excludedMissingValueCount: 0,
        groups: [
          {
            currencyCode: 'EUR',
            dealCount: 2,
            rawValueAmountMinor: 20000,
            source: 'website',
            utmCampaign: null,
            utmMedium: null,
            utmSource: null,
            weightedValueAmountMinor: 12000,
            winRateBps: 5000,
          },
        ],
      },
      weightedPipeline: {
        currencySummaries: [
          {
            closedLostAmountMinor: 1000,
            closedWonAmountMinor: 3000,
            currencyCode: 'EUR',
            forecastBestAmountMinor: 2000,
            forecastCommitAmountMinor: 5000,
            forecastOmittedAmountMinor: 0,
            forecastPipelineAmountMinor: 1000,
            openDealCount: 2,
            rawValueAmountMinor: 20000,
            weightedValueAmountMinor: 8000,
          },
          {
            closedLostAmountMinor: 0,
            closedWonAmountMinor: 0,
            currencyCode: 'USD',
            forecastBestAmountMinor: 0,
            forecastCommitAmountMinor: 0,
            forecastOmittedAmountMinor: 0,
            forecastPipelineAmountMinor: 7000,
            openDealCount: 1,
            rawValueAmountMinor: 10000,
            weightedValueAmountMinor: 7000,
          },
        ],
        excludedRowCount: 2,
      },
      winRateBySource: {
        groups: [
          {
            groupKey: 'website',
            lostCount: 1,
            openCount: 3,
            winRateBps: 5000,
            wonCount: 1,
          },
        ],
      },
      window: {
        from: '2026-02-13T12:00:00.000Z',
        to: '2026-05-14T12:00:00.000Z',
      },
    });

    render(
      await CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    );

    expect(screen.getByTestId('agent-crm-reporting-weighted-pipeline')).toHaveTextContent('EUR');
    expect(screen.getByTestId('agent-crm-reporting-weighted-pipeline')).toHaveTextContent('USD');
    expect(screen.getByTestId('agent-crm-reporting-weighted-pipeline')).toHaveTextContent(
      'reporting.weightedPipeline.excludedRows'
    );
    expect(screen.getByTestId('crm-reporting-chart-pipeline-amount')).toHaveTextContent(
      'reporting.charts.pipelineAmount.title'
    );
    expect(screen.getByTestId('agent-crm-reporting-source-breakdown')).toHaveTextContent('website');
    expect(screen.getByTestId('agent-crm-reporting-win-rate')).toHaveTextContent('website');
  });

  it('renders the task-backed work queue with lifecycle controls only on task rows', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getAgentCrmTaskQueueCoreMock.mockResolvedValueOnce([
      {
        createReasonCode: 'follow_up',
        displayLabelCode: 'follow_up',
        dueAt: '2026-05-22T12:00:00.000Z',
        dueBucket: 'due_today',
        href: '/agent/leads/lead-1',
        leadDisplayRef: { id: 'lead-1', label: 'Lead One' },
        lifecycleVersion: 3,
        priority: 'urgent',
        status: 'pending',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: 'task-1',
      },
      {
        createReasonCode: 'follow_up',
        displayLabelCode: 'follow_up',
        dueAt: '2026-05-22T13:00:00.000Z',
        dueBucket: 'due_today',
        href: '/agent/leads/lead-2',
        leadDisplayRef: { id: 'lead-2', label: 'Lead Two' },
        lifecycleVersion: 4,
        priority: 'normal',
        status: 'in_progress',
        subjectReference: { id: 'lead-2', kind: 'lead' },
        taskId: 'task-2',
      },
    ]);

    render(
      await CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    );

    const queue = screen.getByTestId('agent-crm-task-queue-ready');
    expect(queue).toHaveTextContent('crm.taskQueue.title');
    expect(queue).toHaveTextContent('Lead One');
    expect(queue).toHaveTextContent('Lead Two');
    expect(queue).toHaveTextContent('crm.taskQueue.labels.follow_up');
    expect(queue).toHaveTextContent('crm.taskQueue.priority.urgent');
    expect(screen.getAllByTestId('agent-crm-task-queue-open')[0]).toHaveAttribute(
      'href',
      '/agent/leads/lead-1'
    );
    expect(screen.getAllByTestId('agent-crm-task-queue-start')).toHaveLength(1);
    expect(screen.getAllByTestId('agent-crm-task-queue-complete')).toHaveLength(2);
    expect(screen.queryByTestId('agent-lead-complete-follow-up')).toBeNull();
    expect(screen.queryByTestId('agent-lead-schedule-follow-up')).toBeNull();
  });
});
