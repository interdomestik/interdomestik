import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getAdminCrmReportingCoreMock: vi.fn(),
  getBranchManagerCrmReportingCoreMock: vi.fn(),
  getFormatterMock: vi.fn(async () => ({
    number: vi.fn((value: number) => String(value)),
  })),
  getSessionSafeMock: vi.fn(),
  getTranslationsMock: vi.fn(
    async () => (key: string, values?: Record<string, unknown>) =>
      values?.count != null ? `${key}:${values.count}` : key
  ),
  notFoundMock: vi.fn(() => {
    throw new Error('notFound');
  }),
  setRequestLocaleMock: vi.fn(),
  AdminCrmReportingAccessDeniedError: class AdminCrmReportingAccessDeniedError extends Error {
    constructor(readonly reason: string) {
      super(`Admin CRM reporting read denied: ${reason}`);
      this.name = 'AdminCrmReportingAccessDeniedError';
    }
  },
  BranchManagerCrmReportingAccessDeniedError: class BranchManagerCrmReportingAccessDeniedError extends Error {
    constructor(readonly reason: string) {
      super(`Branch-manager CRM reporting read denied: ${reason}`);
      this.name = 'BranchManagerCrmReportingAccessDeniedError';
    }
  },
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
}));

vi.mock('next/navigation', () => ({
  notFound: hoisted.notFoundMock,
}));

vi.mock('next-intl/server', () => ({
  getFormatter: hoisted.getFormatterMock,
  getTranslations: hoisted.getTranslationsMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('./_core', async importOriginal => {
  const actual = await importOriginal<typeof import('./_core')>();
  return {
    ...actual,
    AdminCrmReportingAccessDeniedError: hoisted.AdminCrmReportingAccessDeniedError,
    getAdminCrmReportingCore: hoisted.getAdminCrmReportingCoreMock,
  };
});

vi.mock('./_branch-manager-core', async importOriginal => {
  const actual = await importOriginal<typeof import('./_branch-manager-core')>();
  return {
    ...actual,
    BranchManagerCrmReportingAccessDeniedError: hoisted.BranchManagerCrmReportingAccessDeniedError,
    getBranchManagerCrmReportingCore: hoisted.getBranchManagerCrmReportingCoreMock,
  };
});

vi.mock('@/components/crm/charts/reporting-chart-boundary', () => ({
  PipelineAmountChartBoundary: ({ title }: { title: string }) => (
    <div data-testid="crm-reporting-chart-pipeline-amount">{title}</div>
  ),
}));

vi.mock('./_backfill-operator', () => ({
  AdminCrmForecastBackfillOperator: () => (
    <div data-testid="admin-crm-forecast-backfill-operator-client" />
  ),
}));

import AdminCrmPage from './page';

describe('AdminCrmPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionSafeMock.mockResolvedValue({
      user: {
        branchId: null,
        id: 'admin-1',
        role: 'admin',
        tenantId: 'tenant-1',
      },
    });
    hoisted.getAdminCrmReportingCoreMock.mockResolvedValue({
      branchPipeline: {
        excludedRowCount: 0,
        rows: [
          {
            branchId: null,
            branchLabel: 'tenant',
            currencyCode: 'EUR',
            excludedInconsistentForecastCount: 0,
            openDealCount: 2,
            pipelineId: 'pipeline-1',
            pipelineLabel: 'pipeline-1',
            totalPipelineAmountMinor: 10000,
            weightedPipelineAmountMinor: 8000,
          },
        ],
        state: 'data',
      },
      forecastObservability: {
        batchRows: [
          {
            branchCount: 1,
            currencyCount: 1,
            firstSnapshotCreatedAt: '2026-05-14T05:00:00.000Z',
            lastSnapshotCreatedAt: '2026-05-14T05:20:00.000Z',
            observedWorkItems: 1,
            pipelineCount: 1,
            snapshotDate: '2026-05-13',
            sourceRunId: 'run-1',
          },
        ],
        coverageRows: [
          {
            branchId: null,
            branchLabel: 'No branch',
            currencyCode: 'EUR',
            latestSnapshotCreatedAt: '2026-05-14T05:20:00.000Z',
            pipelineId: 'pipeline-1',
            pipelineLabel: 'pipeline-1',
            snapshotDate: '2026-05-13',
            snapshotVersion: 1,
            sourceRunId: 'run-1',
            status: 'fresh',
          },
        ],
        hiddenCoverageRowCount: 0,
        state: 'data',
        summary: {
          delayedWorkItems: 0,
          expectedWorkItems: 1,
          expectedWorkItemsDeferred: 0,
          generatedAt: '2026-05-14T12:00:00.000Z',
          latestSnapshotCreatedAt: '2026-05-14T05:20:00.000Z',
          latestSourceRunId: 'run-1',
          missingWorkItems: 0,
          observedWorkItems: 1,
          snapshotDate: '2026-05-13',
          staleWorkItems: 0,
          unexpectedObservedWorkItems: 0,
        },
      },
      generatedAt: '2026-05-14T12:00:00.000Z',
      snapshot: {
        excludedRowCount: 0,
        rows: [
          {
            branchId: null,
            closedLostAmountMinor: 0,
            closedWonAmountMinor: 0,
            currencyCode: 'EUR',
            freshness: 'fresh',
            openDealCount: 2,
            pipelineId: 'pipeline-1',
            snapshotDate: '2026-05-13',
            snapshotVersion: 1,
            totalPipelineAmountMinor: 10000,
            weightedPipelineAmountMinor: 8000,
          },
        ],
        state: 'data',
      },
      snapshotDate: '2026-05-13',
      sourceBreakdown: {
        excludedRowCount: 1,
        rows: [
          {
            currencyCode: 'EUR',
            dealCount: 2,
            excludedInconsistentForecastCount: 0,
            sourceLabel: 'website',
            totalAmountMinor: 10000,
            weightedAmountMinor: 8000,
          },
        ],
        state: 'data',
      },
      window: {
        from: '2026-02-13T12:00:00.000Z',
        to: '2026-05-14T12:00:00.000Z',
      },
    });
    hoisted.getBranchManagerCrmReportingCoreMock.mockResolvedValue({
      branchLabel: 'branch-1',
      branchPipeline: {
        excludedRowCount: 0,
        rows: [
          {
            branchId: 'branch-1',
            branchLabel: 'branch-1',
            currencyCode: 'EUR',
            excludedInconsistentForecastCount: 0,
            openDealCount: 2,
            pipelineId: 'pipeline-1',
            pipelineLabel: 'pipeline-1',
            totalPipelineAmountMinor: 10000,
            weightedPipelineAmountMinor: 8000,
          },
        ],
        state: 'data',
      },
      generatedAt: '2026-05-14T12:00:00.000Z',
      snapshot: {
        excludedRowCount: 0,
        rows: [
          {
            branchId: 'branch-1',
            branchLabel: 'branch-1',
            closedLostAmountMinor: 0,
            closedWonAmountMinor: 0,
            currencyCode: 'EUR',
            freshness: 'fresh',
            openDealCount: 2,
            pipelineId: 'pipeline-1',
            pipelineLabel: 'pipeline-1',
            snapshotDate: '2026-05-13',
            snapshotVersion: 1,
            totalPipelineAmountMinor: 10000,
            weightedPipelineAmountMinor: 8000,
          },
        ],
        state: 'data',
      },
      snapshotDate: '2026-05-13',
      sourceBreakdown: {
        excludedRowCount: 1,
        rows: [
          {
            branchId: 'branch-1',
            branchLabel: 'branch-1',
            currencyCode: 'EUR',
            dealCount: 2,
            excludedInconsistentForecastCount: 0,
            sourceLabel: 'website',
            totalAmountMinor: 10000,
            weightedAmountMinor: 8000,
          },
        ],
        state: 'data',
      },
      window: {
        from: '2026-02-13T12:00:00.000Z',
        to: '2026-05-14T12:00:00.000Z',
      },
    });
  });

  it('renders the admin CRM page and all reporting markers for an admin session', async () => {
    const tree = await AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) });

    render(tree);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.getAdminCrmReportingCoreMock).toHaveBeenCalledWith(
      {
        actor: {
          actorId: 'admin-1',
          role: 'admin',
          scope: { branchId: null },
          tenantId: 'tenant-1',
        },
      },
      { labels: { noBranch: 'labels.noBranch' } }
    );
    expect(screen.getByTestId('admin-crm-page-ready')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-reporting-snapshot')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-reporting-branch-pipeline')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-reporting-source-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-observability-summary')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-observability-coverage')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-observability-batches')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-backfill-operator-form')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-backfill-operator-client')).toBeInTheDocument();
    expect(screen.getByTestId('crm-reporting-chart-pipeline-amount')).toHaveTextContent(
      'charts.pipelineAmount.title'
    );
  });

  it.each(['tenant_admin', 'super_admin'])(
    'maps %s sessions to the CRM admin actor',
    async role => {
      hoisted.getSessionSafeMock.mockResolvedValueOnce({
        user: {
          branchId: 'branch-1',
          id: `${role}-1`,
          role,
          tenantId: 'tenant-1',
        },
      });

      const tree = await AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) });

      render(tree);

      expect(hoisted.getAdminCrmReportingCoreMock).toHaveBeenCalledWith(
        {
          actor: {
            actorId: `${role}-1`,
            role: 'admin',
            scope: { branchId: 'branch-1' },
            tenantId: 'tenant-1',
          },
        },
        { labels: { noBranch: 'labels.noBranch' } }
      );
      expect(hoisted.getBranchManagerCrmReportingCoreMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('admin-crm-reporting-branch-pipeline')).toBeInTheDocument();
    }
  );

  it('renders branch-manager scoped CRM reporting without using the admin core', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        branchId: 'branch-1',
        id: 'manager-1',
        role: 'branch_manager',
        tenantId: 'tenant-1',
      },
    });

    const tree = await AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) });

    render(tree);

    expect(hoisted.getAdminCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getBranchManagerCrmReportingCoreMock).toHaveBeenCalledWith(
      {
        actor: {
          actorId: 'manager-1',
          role: 'branch_manager',
          scope: { branchId: 'branch-1' },
          tenantId: 'tenant-1',
        },
      },
      { branchLabel: 'branch-1' }
    );
    expect(screen.getByTestId('admin-crm-page-ready')).toBeInTheDocument();
    expect(screen.getByTestId('branch-manager-crm-reporting-snapshot')).toBeInTheDocument();
    expect(screen.getByTestId('branch-manager-crm-reporting-branch-pipeline')).toBeInTheDocument();
    expect(screen.getByTestId('branch-manager-crm-reporting-source-breakdown')).toBeInTheDocument();
    expect(
      screen.queryByTestId('admin-crm-forecast-observability-summary')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('admin-crm-forecast-observability-coverage')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('admin-crm-forecast-observability-batches')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('admin-crm-forecast-backfill-operator-form')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('admin-crm-forecast-backfill-operator-client')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('crm-reporting-chart-pipeline-amount')).toHaveTextContent(
      'charts.pipelineAmount.title'
    );
  });

  it('omits the branch-manager pipeline chart when scoped pipeline rows are empty', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        branchId: 'branch-1',
        id: 'manager-1',
        role: 'branch_manager',
        tenantId: 'tenant-1',
      },
    });
    hoisted.getBranchManagerCrmReportingCoreMock.mockResolvedValueOnce({
      branchLabel: 'branch-1',
      branchPipeline: {
        excludedRowCount: 0,
        rows: [],
        state: 'empty',
      },
      generatedAt: '2026-05-14T12:00:00.000Z',
      snapshot: {
        excludedRowCount: 0,
        rows: [
          {
            branchId: 'branch-1',
            branchLabel: 'branch-1',
            closedLostAmountMinor: 0,
            closedWonAmountMinor: 0,
            currencyCode: 'EUR',
            freshness: 'fresh',
            openDealCount: 2,
            pipelineId: 'pipeline-1',
            pipelineLabel: 'pipeline-1',
            snapshotDate: '2026-05-13',
            snapshotVersion: 1,
            totalPipelineAmountMinor: 10000,
            weightedPipelineAmountMinor: 8000,
          },
        ],
        state: 'data',
      },
      snapshotDate: '2026-05-13',
      sourceBreakdown: {
        excludedRowCount: 0,
        rows: [],
        state: 'empty',
      },
      window: {
        from: '2026-02-13T12:00:00.000Z',
        to: '2026-05-14T12:00:00.000Z',
      },
    });

    const tree = await AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) });

    render(tree);

    expect(screen.getByTestId('branch-manager-crm-reporting-branch-pipeline')).toBeInTheDocument();
    expect(screen.queryByTestId('crm-reporting-chart-pipeline-amount')).not.toBeInTheDocument();
  });

  it('keeps branch-manager rendered labels aggregate-only', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        branchId: 'branch-1',
        id: 'manager-1',
        role: 'branch_manager',
        tenantId: 'tenant-1',
      },
    });

    const tree = await AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) });

    render(tree);

    const renderedText = document.body.textContent ?? '';
    expect(renderedText).toContain('branch-1');
    expect(renderedText).toContain('pipeline-1');
    expect(renderedText).toContain('website');
    for (const forbidden of [
      'alice@example.com',
      '+15555550123',
      'Alice Member',
      'private member note',
      'member deal name',
    ]) {
      expect(renderedText).not.toContain(forbidden);
    }
  });

  it('fails closed for branch-manager sessions without branch scope before actor construction', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        branchId: null,
        id: 'manager-1',
        role: 'branch_manager',
        tenantId: 'tenant-1',
      },
    });

    await expect(AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow(
      'notFound'
    );

    expect(hoisted.getAdminCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getBranchManagerCrmReportingCoreMock).not.toHaveBeenCalled();
  });

  it('fails closed for admin-like sessions without a tenant before loading reporting data', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        branchId: null,
        id: 'admin-1',
        role: 'admin',
        tenantId: null,
      },
    });

    await expect(AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow(
      'notFound'
    );

    expect(hoisted.getAdminCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getBranchManagerCrmReportingCoreMock).not.toHaveBeenCalled();
  });
});
