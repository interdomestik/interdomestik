import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
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
  getLeadActivitiesMock: vi.fn(),
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

vi.mock('@/actions/activities', () => ({
  getLeadActivities: hoisted.getLeadActivitiesMock,
}));

vi.mock('@/app/[locale]/(agent)/agent/leads/[id]/_core', () => ({
  getAgentLeadDetailsCore: hoisted.getAgentLeadDetailsCoreMock,
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
  }: {
    asChild?: boolean;
    children: ReactNode;
    disabled?: boolean;
  }) => (asChild ? children : <button disabled={disabled}>{children}</button>),
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
      user: { id: 'agent-1', tenantId: 'tenant-1' },
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
    hoisted.getLeadActivitiesMock.mockResolvedValue([]);
  });

  it('rejects a session with missing tenant identity before loading lead details', async () => {
    const session = { user: { id: 'agent-1', tenantId: null } };
    hoisted.getSessionMock.mockResolvedValue(session);
    hoisted.ensureTenantIdMock.mockImplementationOnce(() => {
      throw new Error('Session missing tenantId. Data integrity issue.');
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'Session missing tenantId. Data integrity issue.'
    );

    expect(hoisted.ensureTenantIdMock).toHaveBeenCalledWith(session);
    expect(hoisted.getAgentLeadDetailsCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getLeadActivitiesMock).not.toHaveBeenCalled();
  });

  it('passes tenant identity into the lead detail core before loading activities', async () => {
    await AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' });

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.getAgentLeadDetailsCoreMock).toHaveBeenCalledWith({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      viewerAgentId: 'agent-1',
    });
    expect(hoisted.getLeadActivitiesMock).toHaveBeenCalledWith('lead-1');
  });

  it('does not load activities when the lead detail core returns not_found', async () => {
    hoisted.getAgentLeadDetailsCoreMock.mockResolvedValueOnce({
      kind: 'not_found',
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'not-found'
    );

    expect(hoisted.notFoundMock).toHaveBeenCalled();
    expect(hoisted.getLeadActivitiesMock).not.toHaveBeenCalled();
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
});
