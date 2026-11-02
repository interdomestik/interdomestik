import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  AgentLeadDetailsAccessDeniedError: class AgentLeadDetailsAccessDeniedError extends Error {
    constructor(readonly reason: string) {
      super(`CRM lead detail read denied: ${reason}`);
      this.name = 'AgentLeadDetailsAccessDeniedError';
    }
  },
  headersMock: vi.fn(() => Promise.resolve(new Headers())),
  redirectMock: vi.fn((params: { href: string; locale: string }) => {
    throw new Error(`redirect:${params.href}:${params.locale}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('not-found');
  }),
  setRequestLocaleMock: vi.fn(),
  getTranslationsMock: vi.fn((_namespace?: string) => Promise.resolve((key: string) => key)),
  getSessionMock: vi.fn(),
  ensureTenantIdMock: vi.fn((_session?: unknown) => 'tenant-1'),
  getAgentLeadDetailsCoreMock: vi.fn(),
  getAgentCrmLeadActivitiesMock: vi.fn(),
  listCrmLeadFollowUpTasksForLeadMock: vi.fn(),
  crmLeadActivityRepository: {},
  createCrmLeadActivityRepository: vi.fn(),
  authority: (tenantId: string) => mintTestTenantAuthority(tenantId),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  notFound: hoisted.notFoundMock,
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

vi.mock('@/actions/agent-crm-follow-up', () => ({
  completeAgentLeadFollowUp: vi.fn(),
  scheduleAgentLeadFollowUp: vi.fn(),
}));

vi.mock('@/adapters/crm/lead-activity-repository', () => ({
  createCrmLeadActivityRepository: hoisted.createCrmLeadActivityRepository,
}));

vi.mock('@/adapters/crm/lead-follow-up-repository', () => ({
  listCrmLeadFollowUpTasksForLead: hoisted.listCrmLeadFollowUpTasksForLeadMock,
}));

vi.mock('@/app/[locale]/(agent)/agent/leads/[id]/_core', () => ({
  AgentLeadDetailsAccessDeniedError: hoisted.AgentLeadDetailsAccessDeniedError,
  getAgentLeadDetailsCore: hoisted.getAgentLeadDetailsCoreMock,
}));

vi.mock('@interdomestik/domain-crm/lead-activities', () => ({
  getAgentCrmLeadActivities: hoisted.getAgentCrmLeadActivitiesMock,
}));

vi.mock('@/components/crm/activity-feed', () => ({
  ActivityFeed: () => null,
}));

vi.mock('@/components/crm/log-activity-dialog', () => ({
  LogActivityDialog: () => null,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  redirect: hoisted.redirectMock,
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({
    asChild,
    children,
    disabled,
    type,
  }: {
    asChild?: boolean;
    children: ReactNode;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }) =>
    asChild ? (
      children
    ) : (
      <button disabled={disabled} type={type}>
        {children}
      </button>
    ),
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: ReactNode }) => children,
  CardHeader: ({ children }: { children: ReactNode }) => children,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

export { hoisted };
