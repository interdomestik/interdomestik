import {
  hoisted,
  authority,
  repository,
  actor,
  createSelectChain,
  createGroupByChain,
  createJoinSelectChain,
  createDueFollowUpsChain,
} from './dashboard-repository.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('createCrmDashboardRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters every CRM dashboard read by tenant, agent, and branch where the row carries branch custody', async () => {
    const leadChain = createGroupByChain([]);
    const dealsChain = createJoinSelectChain([{ count: 0 }]);
    const commissionChain = createSelectChain([{ total: null }]);
    const dueFollowUpsChain = createDueFollowUpsChain([]);
    const taskFollowUpsChain = createDueFollowUpsChain([]);

    hoisted.dbSelect
      .mockReturnValueOnce(leadChain)
      .mockReturnValueOnce(dealsChain)
      .mockReturnValueOnce(commissionChain)
      .mockReturnValueOnce(dueFollowUpsChain)
      .mockReturnValueOnce(taskFollowUpsChain);

    await repository.readAgentDashboard({
      actor,
      limit: 5,
      now: '2026-05-12T08:00:00.000Z',
    });

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(5);
    for (const call of hoisted.withTenantContext.mock.calls) {
      expect(call[0]).toBe(authority);
    }

    expect(leadChain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmLeads.tenantId', 'tenant-1'] },
        { eq: ['crmLeads.agentId', 'agent-1'] },
        { eq: ['crmLeads.branchId', 'branch-1'] },
        { inArray: ['crmLeads.stage', ['new', 'contacted']] },
      ],
    });

    expect(dealsChain.innerJoin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'crmLeads.id' }),
      {
        and: [
          { eq: ['crmLeads.tenantId', 'tenant-1'] },
          { eq: ['crmLeads.id', 'crmDeals.leadId'] },
          { eq: ['crmLeads.agentId', 'agent-1'] },
          { eq: ['crmLeads.branchId', 'branch-1'] },
        ],
      }
    );
    expect(dealsChain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmDeals.tenantId', 'tenant-1'] },
        { eq: ['crmDeals.agentId', 'agent-1'] },
        { eq: ['crmDeals.stage', 'closed_won'] },
      ],
    });

    expect(commissionChain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['agentCommissions.tenantId', 'tenant-1'] },
        { eq: ['agentCommissions.agentId', 'agent-1'] },
        { eq: ['agentCommissions.status', 'paid'] },
      ],
    });

    expect(dueFollowUpsChain.innerJoin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'crmLeads.id' }),
      {
        and: [
          { eq: ['crmLeads.id', 'crmActivities.leadId'] },
          { eq: ['crmLeads.tenantId', 'tenant-1'] },
          { eq: ['crmLeads.agentId', 'agent-1'] },
          { eq: ['crmLeads.branchId', 'branch-1'] },
        ],
      }
    );
    expect(dueFollowUpsChain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmActivities.tenantId', 'tenant-1'] },
        { eq: ['crmActivities.agentId', 'agent-1'] },
        { eq: ['crmActivities.branchId', 'branch-1'] },
        { eq: ['crmActivities.type', 'follow_up'] },
        { isNull: 'crmActivities.completedAt' },
        { lte: ['crmActivities.scheduledAt', expect.any(Date)] },
      ],
    });
    expect(dueFollowUpsChain.afterWhere.orderBy).toHaveBeenCalledWith(
      { asc: 'crmActivities.scheduledAt' },
      { asc: 'crmActivities.id' }
    );
    expect(dueFollowUpsChain.afterOrderBy.limit).toHaveBeenCalledWith(10);

    expect(taskFollowUpsChain.innerJoin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'crmLeads.id' }),
      {
        and: [
          { eq: ['crmLeads.id', 'crmTasks.subjectId'] },
          { eq: ['crmLeads.tenantId', 'tenant-1'] },
          { eq: ['crmLeads.agentId', 'agent-1'] },
          { eq: ['crmLeads.branchId', 'branch-1'] },
        ],
      }
    );
    expect(taskFollowUpsChain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmTasks.tenantId', 'tenant-1'] },
        { eq: ['crmTasks.branchId', 'branch-1'] },
        { eq: ['crmTasks.subjectKind', 'lead'] },
        { eq: ['crmTasks.createReasonCode', 'follow_up'] },
        { eq: ['crmTasks.assignedKind', 'actor'] },
        { eq: ['crmTasks.assignedActorId', 'agent-1'] },
        { inArray: ['crmTasks.status', ['pending', 'in_progress']] },
        { lte: ['crmTasks.dueAt', expect.any(Date)] },
      ],
    });
    expect(taskFollowUpsChain.afterWhere.orderBy).toHaveBeenCalledWith(
      { asc: 'crmTasks.dueAt' },
      { asc: 'crmTasks.id' }
    );
    expect(taskFollowUpsChain.afterOrderBy.limit).toHaveBeenCalledWith(10);
  });
});
