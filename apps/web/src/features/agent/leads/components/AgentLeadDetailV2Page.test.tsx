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
      authority: expect.any(Object),
      leadId: 'lead-1',
    });
    expect(hoisted.createCrmLeadActivityRepository).toHaveBeenCalledWith(expect.any(Object));
    expect(hoisted.getAgentCrmLeadActivitiesMock).toHaveBeenCalledWith(
      {
        actor,
        leadId: 'lead-1',
      },
      hoisted.crmLeadActivityRepository
    );
    expect(hoisted.listCrmLeadFollowUpTasksForLeadMock).toHaveBeenCalledWith({
      actor,
      authority: expect.any(Object),
      leadId: 'lead-1',
    });
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
});
