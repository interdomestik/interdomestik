import { beforeEach, vi } from 'vitest';
import { hoisted } from './AgentLeadDetailV2Page.test-support';

export function installAgentLeadDetailV2PageHooks(): void {
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
}
