import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getAdminCrmReportingCoreMock: vi.fn(),
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

vi.mock('@/components/crm/charts/reporting-chart-boundary', () => ({
  PipelineAmountChartBoundary: ({ title }: { title: string }) => (
    <div data-testid="crm-reporting-chart-pipeline-amount">{title}</div>
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
  });

  it('renders the admin CRM page and all reporting markers for an admin session', async () => {
    const tree = await AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) });

    render(tree);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.getAdminCrmReportingCoreMock).toHaveBeenCalledWith({
      actor: {
        actorId: 'admin-1',
        role: 'admin',
        scope: { branchId: null },
        tenantId: 'tenant-1',
      },
    });
    expect(screen.getByTestId('admin-crm-page-ready')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-reporting-snapshot')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-reporting-branch-pipeline')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-reporting-source-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('crm-reporting-chart-pipeline-amount')).toHaveTextContent(
      'charts.pipelineAmount.title'
    );
  });

  it('fails closed for branch-manager sessions before loading reporting data', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        branchId: 'branch-1',
        id: 'manager-1',
        role: 'branch_manager',
        tenantId: 'tenant-1',
      },
    });

    await expect(AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow(
      'notFound'
    );

    expect(hoisted.getAdminCrmReportingCoreMock).not.toHaveBeenCalled();
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
  });
});
