import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

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
  ensureTenantIdMock: vi.fn((_session?: unknown) => 'tenant-1'),
  authority: (tenantId: string) => mintTestTenantAuthority(tenantId),
  getAgentCrmCompletedTaskQueueCoreMock: vi.fn(),
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

// Mirrors the session producer: it resolves the session, fails closed on a tenant-less session
// (ensureTenantId) and mints the authority for that tenant.
vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: async () => {
    const session = await hoisted.getSessionMock();
    if (!session?.user) return null;
    const tenantId = hoisted.ensureTenantIdMock(session);
    return { session, authority: hoisted.authority(tenantId) };
  },
}));

vi.mock('./_core', () => ({
  AgentCrmReportingAccessDeniedError: hoisted.AgentCrmReportingAccessDeniedError,
  AgentCrmStatsAccessDeniedError: hoisted.AgentCrmStatsAccessDeniedError,
  getAgentCrmCompletedTaskQueueCore: hoisted.getAgentCrmCompletedTaskQueueCoreMock,
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

export function taskQueueItem(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

export { hoisted };
