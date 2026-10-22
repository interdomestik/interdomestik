import { beforeEach, vi } from 'vitest';

import { createAdminCrmReportingFixture } from './page-reporting.fixture';

const hoisted = vi.hoisted(() => ({
  getAdminCrmReportingCoreMock: vi.fn(),
  getAdminCrmRoutingRulesCoreMock: vi.fn(),
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

vi.mock('./_routing-tenant', async importOriginal => {
  const actual = await importOriginal<typeof import('./_routing-tenant')>();
  return {
    ...actual,
    getAdminCrmRoutingRulesCore: hoisted.getAdminCrmRoutingRulesCoreMock,
  };
});

vi.mock('./_routing-rules-panel', () => ({
  AdminCrmRoutingRulesPanel: () => <div data-testid="admin-crm-routing-rules-list" />,
}));

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
  hoisted.getAdminCrmReportingCoreMock.mockResolvedValue(createAdminCrmReportingFixture());
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
  hoisted.getAdminCrmRoutingRulesCoreMock.mockResolvedValue({
    counts: { active: 1, archived: 0 },
    rules: [
      {
        agentPoolCount: 2,
        archived: false,
        capacityCaps: {
          maxNewLeadsPerAgentPerDay: null,
          maxOpenLeadsPerAgent: null,
        },
        effectiveWindow: { from: null, to: null },
        enabled: true,
        fallback: { agentId: null, ruleId: null },
        filters: {
          leadType: null,
          source: 'website',
          utmCampaign: null,
          utmMedium: null,
          utmSource: null,
        },
        id: 'rule-1',
        priority: 0,
        scope: { kind: 'tenant' },
        strategy: 'round_robin',
        updatedAt: '2026-05-14T12:00:00.000Z',
      },
    ],
  });
});

export { hoisted };
