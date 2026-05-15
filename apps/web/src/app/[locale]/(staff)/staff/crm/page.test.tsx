import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  StaffCrmReportingAccessDeniedError: class StaffCrmReportingAccessDeniedError extends Error {
    constructor(readonly reason: string) {
      super(`Staff CRM reporting read denied: ${reason}`);
      this.name = 'StaffCrmReportingAccessDeniedError';
    }
  },
  getFormatterMock: vi.fn(async () => ({
    number: vi.fn((value: number) => String(value)),
  })),
  getSessionSafeMock: vi.fn(),
  getStaffCrmReportingCoreMock: vi.fn(),
  getTranslationsMock: vi.fn(async () => (key: string, values?: Record<string, unknown>) => {
    if (values?.count != null) return `${key}:${values.count}`;
    if (values?.days != null) return `${key}:${values.days}`;
    return key;
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('notFound');
  }),
  setRequestLocaleMock: vi.fn(),
}));

vi.mock('@/components/shell/session', () => {
  return { getSessionSafe: hoisted.getSessionSafeMock };
});

vi.mock('next/navigation', () => {
  return { notFound: hoisted.notFoundMock };
});

vi.mock('next-intl/server', () => {
  const serverMocks = {
    getFormatter: hoisted.getFormatterMock,
    getTranslations: hoisted.getTranslationsMock,
    setRequestLocale: hoisted.setRequestLocaleMock,
  };

  return serverMocks;
});

vi.mock('./_core', async importOriginal => {
  type StaffCrmCoreModule = typeof import('./_core');
  const actual = await importOriginal<StaffCrmCoreModule>();

  return Object.assign({}, actual, {
    StaffCrmReportingAccessDeniedError: hoisted.StaffCrmReportingAccessDeniedError,
    getStaffCrmReportingCore: hoisted.getStaffCrmReportingCoreMock,
  });
});

vi.mock('@/components/crm/charts/reporting-chart-boundary', () => ({
  FunnelMovementChartBoundary: ({ title }: { title: string }) => (
    <div data-testid="crm-reporting-chart-funnel-movement">{title}</div>
  ),
  PipelineAmountChartBoundary: ({ title }: { title: string }) => (
    <div data-testid="crm-reporting-chart-pipeline-amount">{title}</div>
  ),
  StageVelocityChartBoundary: ({ title }: { title: string }) => (
    <div data-testid="crm-reporting-chart-stage-velocity">{title}</div>
  ),
}));

import StaffCrmPage from './page';

function dataDashboard() {
  return {
    funnelMovement: {
      excludedRowCount: 0,
      rows: [
        {
          conversionRateBps: 5000,
          dropOffRateBps: 2500,
          enteredCount: 4,
          exitedCount: 3,
          lostCount: 1,
          pipelineId: 'pipeline-1',
          pipelineLabel: 'pipeline-1',
          stageId: 'stage-qualified',
          stageLabel: 'stage-qualified',
          wonCount: 2,
        },
      ],
      state: 'data',
    },
    generatedAt: '2026-05-14T12:00:00.000Z',
    pipelineWorkload: {
      excludedRowCount: 1,
      rows: [
        {
          branchId: null,
          branchLabel: 'No branch',
          currencyCode: 'EUR',
          excludedInconsistentForecastCount: 0,
          forecastBestAmountMinor: 3000,
          forecastCommitAmountMinor: 5000,
          openDealCount: 2,
          pipelineId: 'pipeline-1',
          pipelineLabel: 'pipeline-1',
          totalPipelineAmountMinor: 10000,
          weightedPipelineAmountMinor: 8000,
        },
        {
          branchId: 'branch-2',
          branchLabel: 'branch-2',
          currencyCode: 'USD',
          excludedInconsistentForecastCount: 0,
          forecastBestAmountMinor: 0,
          forecastCommitAmountMinor: 2000,
          openDealCount: 1,
          pipelineId: 'pipeline-2',
          pipelineLabel: 'pipeline-2',
          totalPipelineAmountMinor: 5000,
          weightedPipelineAmountMinor: 2000,
        },
      ],
      state: 'data',
    },
    stageVelocity: {
      excludedRowCount: 1,
      state: 'data',
      summary: {
        excludedOpenIntervalCount: 1,
        rows: [
          {
            averageDays: 4,
            maximumDays: 6,
            medianDays: 5,
            minimumDays: 3,
            pipelineId: 'pipeline-1',
            pipelineLabel: 'pipeline-1',
            sampleCount: 3,
            stageId: 'stage-qualified',
            stageLabel: 'stage-qualified',
          },
        ],
      },
    },
    window: {
      from: '2026-02-13T12:00:00.000Z',
      to: '2026-05-14T12:00:00.000Z',
    },
  };
}

describe('StaffCrmPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionSafeMock.mockResolvedValue({
      user: {
        branchId: null,
        id: 'staff-1',
        role: 'staff',
        tenantId: 'tenant-1',
      },
    });
    hoisted.getStaffCrmReportingCoreMock.mockResolvedValue(dataDashboard());
  });

  it('renders the staff CRM page and all reporting markers for a staff session', async () => {
    render(await StaffCrmPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.getStaffCrmReportingCoreMock).toHaveBeenCalledWith(
      {
        actor: {
          actorId: 'staff-1',
          role: 'staff',
          scope: { branchId: null, staffId: 'staff-1' },
          tenantId: 'tenant-1',
        },
      },
      { labels: { noBranch: 'label.no-branch' } }
    );
    expect(screen.getByTestId('staff-crm-page-ready')).toBeInTheDocument();
    expect(screen.getByTestId('staff-crm-reporting-pipeline-workload')).toHaveTextContent('EUR');
    expect(screen.getByTestId('staff-crm-reporting-pipeline-workload')).toHaveTextContent('USD');
    expect(screen.getByTestId('staff-crm-reporting-funnel-movement')).toBeInTheDocument();
    expect(screen.getByTestId('staff-crm-reporting-stage-velocity')).toBeInTheDocument();
    expect(screen.getByTestId('crm-reporting-chart-pipeline-amount')).toHaveTextContent(
      'charts.pipelineAmount.title'
    );
    expect(screen.getByTestId('crm-reporting-chart-funnel-movement')).toHaveTextContent(
      'charts.funnelMovement.title'
    );
    expect(screen.getByTestId('crm-reporting-chart-stage-velocity')).toHaveTextContent(
      'charts.stageVelocity.title'
    );
  });

  it('fails closed for non-staff sessions before loading reporting data', async () => {
    for (const user of [
      { branchId: 'branch-1', id: 'manager-1', role: 'branch_manager', tenantId: 'tenant-1' },
      { branchId: null, id: 'admin-1', role: 'admin', tenantId: 'tenant-1' },
      { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
      { branchId: null, id: 'member-1', role: 'member', tenantId: 'tenant-1' },
      { branchId: null, id: 'staff-1', role: 'staff', tenantId: null },
      { branchId: null, id: 'staff-1', role: null, tenantId: 'tenant-1' },
    ]) {
      hoisted.getSessionSafeMock.mockResolvedValueOnce({ user });

      await expect(StaffCrmPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow(
        'notFound'
      );
    }

    expect(hoisted.getStaffCrmReportingCoreMock).not.toHaveBeenCalled();
  });

  it('fails closed when the staff CRM reporting core denies access', async () => {
    hoisted.getStaffCrmReportingCoreMock.mockRejectedValueOnce(
      new hoisted.StaffCrmReportingAccessDeniedError('role_scope')
    );

    await expect(StaffCrmPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow(
      'notFound'
    );

    expect(hoisted.notFoundMock).toHaveBeenCalled();
  });

  it('renders empty and error states while preserving widget markers', async () => {
    hoisted.getStaffCrmReportingCoreMock.mockResolvedValueOnce({
      funnelMovement: {
        excludedRowCount: 0,
        rows: [],
        state: 'empty',
      },
      generatedAt: '2026-05-14T12:00:00.000Z',
      pipelineWorkload: {
        excludedRowCount: 0,
        messageKey: 'error.generic',
        rows: [],
        state: 'error',
      },
      stageVelocity: {
        excludedRowCount: 0,
        state: 'empty',
        summary: { excludedOpenIntervalCount: 0, rows: [] },
      },
      window: {
        from: '2026-02-13T12:00:00.000Z',
        to: '2026-05-14T12:00:00.000Z',
      },
    });

    render(await StaffCrmPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByTestId('staff-crm-page-ready')).toBeInTheDocument();
    expect(screen.getByTestId('staff-crm-reporting-pipeline-workload')).toHaveTextContent(
      'error.generic'
    );
    expect(screen.getByTestId('staff-crm-reporting-funnel-movement')).toHaveTextContent(
      'funnelMovement.empty'
    );
    expect(screen.getByTestId('staff-crm-reporting-stage-velocity')).toHaveTextContent(
      'stageVelocity.empty'
    );
  });
});
