import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  AgentLeadDetailsAccessDeniedError: class AgentLeadDetailsAccessDeniedError extends Error {
    constructor(readonly reason: string) {
      super(`CRM lead detail read denied: ${reason}`);
      this.name = 'AgentLeadDetailsAccessDeniedError';
    }
  },
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((params: { href: string; locale: string }) => {
    throw new Error(`redirect:${params.href}:${params.locale}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('not-found');
  }),
  setRequestLocaleMock: vi.fn(),
  getTranslationsMock: vi.fn(async (_namespace?: string) => (key: string) => key),
  getSessionMock: vi.fn(),
  ensureTenantIdMock: vi.fn(() => 'tenant-1'),
  getAgentLeadDetailsCoreMock: vi.fn(),
  getAgentCrmLeadActivitiesMock: vi.fn(),
  crmLeadActivityRepository: {},
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

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantIdMock,
}));

vi.mock('@/actions/agent-crm-follow-up', () => ({
  completeAgentLeadFollowUp: vi.fn(),
  scheduleAgentLeadFollowUp: vi.fn(),
}));

vi.mock('@/adapters/crm/lead-activity-repository', () => ({
  crmLeadActivityRepository: hoisted.crmLeadActivityRepository,
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

import { AgentLeadDetailV2Page } from './AgentLeadDetailV2Page';

describe('AgentLeadDetailV2Page tenant contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getTranslationsMock.mockImplementation(
      async (namespace = 'agent.leads_page') =>
        key => {
          const messages: Record<string, string> = {
            'stages.new': 'New localized',
            'stages.negotiation': 'Negotiation localized',
            backToLeads: 'Back localized',
            detailTitleFallback: 'Lead fallback localized',
            sourceLabel: 'Source localized',
            emptyValue: 'Empty localized',
            'actions.createDealUnavailable': 'Deal creation unavailable localized',
            'detail.contactInformation': 'Contact localized',
            'detail.type': 'Type localized',
            'detail.email': 'Email localized',
            'detail.phone': 'Phone localized',
            'detail.company': 'Company localized',
            'types.individual': 'Individual localized',
            'types.business': 'Business localized',
            'deals.title': 'Deals localized',
            'deals.empty': 'No deals localized',
            'deals.membershipPlan': 'Membership plan localized',
            'dealStatuses.open': 'Open localized',
            'dealStatuses.won': 'Won localized',
            'dealStatuses.lost': 'Lost localized',
            'dealStatuses.unknown': 'Unknown localized',
            activityHistory: 'Activity localized',
            'followUp.title': 'Follow-up localized',
            'followUp.empty': 'No follow-up localized',
            'followUp.defaultSubject': 'Follow up with lead localized',
            'followUp.scheduleNow': 'Add follow-up localized',
            'followUp.dueNow': 'Due now localized',
            'followUp.scheduled': 'Scheduled localized',
            'followUp.complete': 'Complete follow-up localized',
          };

          return `${namespace}:${messages[key] ?? key}`;
        }
    );
    hoisted.ensureTenantIdMock.mockReturnValue('tenant-1');
    hoisted.getAgentLeadDetailsCoreMock.mockResolvedValue({
      kind: 'ok',
      lead: {
        id: 'lead-1',
        agentId: 'agent-1',
        tenantId: 'tenant-1',
        fullName: 'Lead',
        stage: 'new',
        type: 'individual',
        email: 'lead@example.com',
        phone: null,
        companyName: null,
        source: 'referral',
      },
      deals: [],
    });
    hoisted.getAgentCrmLeadActivitiesMock.mockResolvedValue({ success: true, activities: [] });
  });

  it('rejects a session with missing tenant identity before loading lead details', async () => {
    const session = {
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: null },
    };
    hoisted.getSessionMock.mockResolvedValue(session);
    hoisted.ensureTenantIdMock.mockImplementationOnce(() => {
      throw new Error('Session missing tenantId. Data integrity issue.');
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'Session missing tenantId. Data integrity issue.'
    );

    expect(hoisted.ensureTenantIdMock).toHaveBeenCalledWith(session);
    expect(hoisted.getAgentLeadDetailsCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmLeadActivitiesMock).not.toHaveBeenCalled();
  });

  it('passes actor context into the lead detail and activity read domains', async () => {
    await AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' });

    const actor = {
      actorId: 'agent-1',
      role: 'agent',
      scope: { agentId: 'agent-1', branchId: 'branch-1' },
      tenantId: 'tenant-1',
    };
    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.getAgentLeadDetailsCoreMock).toHaveBeenCalledWith({
      actor,
      leadId: 'lead-1',
    });
    expect(hoisted.getAgentCrmLeadActivitiesMock).toHaveBeenCalledWith(
      {
        actor,
        leadId: 'lead-1',
      },
      hoisted.crmLeadActivityRepository
    );
  });

  it('rejects a non-agent or branchless session before loading lead details', async () => {
    hoisted.getSessionMock.mockResolvedValueOnce({
      user: { branchId: null, id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'not-found'
    );

    expect(hoisted.notFoundMock).toHaveBeenCalled();
    expect(hoisted.getAgentLeadDetailsCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmLeadActivitiesMock).not.toHaveBeenCalled();
  });

  it('does not load activities when the lead detail core returns not_found', async () => {
    hoisted.getAgentLeadDetailsCoreMock.mockResolvedValueOnce({
      kind: 'not_found',
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'not-found'
    );

    expect(hoisted.notFoundMock).toHaveBeenCalled();
    expect(hoisted.getAgentCrmLeadActivitiesMock).not.toHaveBeenCalled();
  });

  it('does not load activities when the lead detail core denies access', async () => {
    hoisted.getAgentLeadDetailsCoreMock.mockRejectedValueOnce(
      new hoisted.AgentLeadDetailsAccessDeniedError('branch_scope')
    );

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'not-found'
    );

    expect(hoisted.notFoundMock).toHaveBeenCalled();
    expect(hoisted.getAgentCrmLeadActivitiesMock).not.toHaveBeenCalled();
  });

  it('does not render when the activity domain denies the read after lead authorization', async () => {
    hoisted.getAgentCrmLeadActivitiesMock.mockResolvedValueOnce({
      success: false,
      error: 'forbidden',
      reason: 'branch_scope',
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'not-found'
    );

    expect(hoisted.notFoundMock).toHaveBeenCalled();
  });

  it('preserves the route locale when redirecting unauthenticated sessions to login', async () => {
    hoisted.getSessionMock.mockResolvedValueOnce(null);

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'sq' })).rejects.toThrow(
      'redirect:/login:sq'
    );

    expect(hoisted.redirectMock).toHaveBeenCalledWith({ href: '/login', locale: 'sq' });
    expect(hoisted.getAgentLeadDetailsCoreMock).not.toHaveBeenCalled();
  });

  it('renders localized detail copy and an inert deal action', async () => {
    const element = await AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('agent.leads_page:Contact localized');
    expect(html).toContain('agent.leads_page:New localized');
    expect(html).toContain('agent.leads_page:Deal creation unavailable localized');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('Contact Information');
    expect(html).not.toContain('Create Deal');
  });

  it('renders deal status and value through localized detail formatting', async () => {
    hoisted.getAgentLeadDetailsCoreMock.mockResolvedValueOnce({
      kind: 'ok',
      lead: {
        id: 'lead-1',
        agentId: 'agent-1',
        tenantId: 'tenant-1',
        fullName: null,
        companyName: null,
        stage: 'negotiation',
        type: 'business',
        source: null,
      },
      deals: [
        {
          id: 'deal-1',
          status: 'open',
          valueCents: 15000,
          closedAt: null,
        },
      ],
    });

    const element = await AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('agent.leads_page:Lead fallback localized');
    expect(html).toContain('agent.leads_page:Negotiation localized');
    expect(html).toContain('agent.leads_page:Business localized');
    expect(html).toContain('agent.leads_page:Open localized');
    expect(html).toContain('€150.00');
  });

  it('renders a schedule action when no follow-up is open', async () => {
    const element = await AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('agent.leads_page:Follow-up localized');
    expect(html).toContain('agent.leads_page:No follow-up localized');
    expect(html).toContain('agent.leads_page:Add follow-up localized');
    expect(html).toContain('name="leadId" value="lead-1"');
  });

  it('renders the due follow-up completion action from lead activities', async () => {
    hoisted.getAgentCrmLeadActivitiesMock.mockResolvedValueOnce({
      success: true,
      activities: [
        {
          id: 'follow-up-1',
          tenantId: 'tenant-1',
          leadId: 'lead-1',
          agentId: 'agent-1',
          branchId: 'branch-1',
          type: 'follow_up',
          subject: 'Call back',
          description: 'Needs a call.',
          occurredAt: '2026-05-10T08:00:00.000Z',
          scheduledAt: '2020-01-01T10:00:00.000Z',
          completedAt: null,
          createdAt: '2026-05-10T08:00:00.000Z',
          agent: null,
        },
      ],
    });

    const element = await AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Call back');
    expect(html).toContain('Needs a call.');
    expect(html).toContain('agent.leads_page:Due now localized');
    expect(html).toContain('agent.leads_page:Complete follow-up localized');
    expect(html).toContain('name="activityId" value="follow-up-1"');
  });
});
