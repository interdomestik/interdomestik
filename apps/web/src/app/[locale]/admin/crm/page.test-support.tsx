import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authorizeSessionTenantMock: vi.fn(),
  getAdminCrmReportingCoreMock: vi.fn(),
  getAdminCrmRoutingRulesCoreMock: vi.fn(),
  getBranchManagerCrmReportingCoreMock: vi.fn(),
  getFormatterMock: vi.fn(() =>
    Promise.resolve({
      number: vi.fn(String),
    })
  ),
  getSessionSafeMock: vi.fn(),
  getTranslationsMock: vi.fn(() =>
    Promise.resolve((key: string, values?: Record<string, string | number>) =>
      values?.count != null ? `${key}:${values.count}` : key
    )
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

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: hoisted.authorizeSessionTenantMock,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
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

vi.mock('./_routing-core', async importOriginal => {
  const actual = await importOriginal<typeof import('./_routing-core')>();
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

export const TEST_AUTHORITY = mintTestTenantAuthority('tenant-1');

export { hoisted };
