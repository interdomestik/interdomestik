import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hoisted } from './AgentLeadDetailV2Page.test-support';
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
    hoisted.createCrmLeadActivityRepository.mockReturnValue(hoisted.crmLeadActivityRepository);
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
    hoisted.listCrmLeadFollowUpTasksForLeadMock.mockResolvedValue([]);
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
    expect(html).toContain('name="source" value="legacy_activity"');
  });

  it('renders task-backed follow-up completion with lifecycle version', async () => {
    hoisted.listCrmLeadFollowUpTasksForLeadMock.mockResolvedValueOnce([
      {
        id: 'task-follow-up-1',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        agentId: 'agent-1',
        branchId: 'branch-1',
        type: 'follow_up',
        subject: 'Follow up',
        description: null,
        occurredAt: '2026-05-10T08:00:00.000Z',
        scheduledAt: '2020-01-01T10:00:00.000Z',
        completedAt: null,
        createdAt: '2026-05-10T08:00:00.000Z',
        expectedLifecycleVersion: 3,
        followUpSource: 'crm_task',
      },
    ]);

    const element = await AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('name="activityId" value="task-follow-up-1"');
    expect(html).toContain('name="source" value="crm_task"');
    expect(html).toContain('name="expectedLifecycleVersion" value="3"');
  });
});
