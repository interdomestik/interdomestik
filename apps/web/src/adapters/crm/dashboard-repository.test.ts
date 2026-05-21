import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbSelect: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    select: hoisted.dbSelect,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {
    agentId: 'agentCommissions.agentId',
    amount: 'agentCommissions.amount',
    status: 'agentCommissions.status',
    tenantId: 'agentCommissions.tenantId',
  },
  crmActivities: {
    agentId: 'crmActivities.agentId',
    branchId: 'crmActivities.branchId',
    completedAt: 'crmActivities.completedAt',
    createdAt: 'crmActivities.createdAt',
    id: 'crmActivities.id',
    leadId: 'crmActivities.leadId',
    scheduledAt: 'crmActivities.scheduledAt',
    summary: 'crmActivities.summary',
    tenantId: 'crmActivities.tenantId',
    type: 'crmActivities.type',
  },
  crmDeals: {
    agentId: 'crmDeals.agentId',
    leadId: 'crmDeals.leadId',
    stage: 'crmDeals.stage',
    tenantId: 'crmDeals.tenantId',
  },
  crmLeads: {
    agentId: 'crmLeads.agentId',
    branchId: 'crmLeads.branchId',
    companyName: 'crmLeads.companyName',
    fullName: 'crmLeads.fullName',
    id: 'crmLeads.id',
    stage: 'crmLeads.stage',
    tenantId: 'crmLeads.tenantId',
  },
  crmTasks: {
    assignedActorId: 'crmTasks.assignedActorId',
    assignedKind: 'crmTasks.assignedKind',
    branchId: 'crmTasks.branchId',
    createReasonCode: 'crmTasks.createReasonCode',
    createdAt: 'crmTasks.createdAt',
    dueAt: 'crmTasks.dueAt',
    id: 'crmTasks.id',
    lifecycleVersion: 'crmTasks.lifecycleVersion',
    status: 'crmTasks.status',
    subjectId: 'crmTasks.subjectId',
    subjectKind: 'crmTasks.subjectKind',
    tenantId: 'crmTasks.tenantId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  asc: vi.fn((col: unknown) => ({ asc: col })),
  count: vi.fn(() => ({ kind: 'count' })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ inArray: [col, vals] })),
  isNull: vi.fn((col: unknown) => ({ isNull: col })),
  lte: vi.fn((a: unknown, b: unknown) => ({ lte: [a, b] })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: { strings, values } }),
}));

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import { crmDashboardRepository } from './dashboard-repository';

const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function createGroupByChain(result: unknown) {
  const afterWhere = { groupBy: vi.fn().mockResolvedValue(result) };
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(afterWhere),
    afterWhere,
  };
}

function createJoinSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function createDueFollowUpsChain(result: unknown) {
  const afterOrderBy = { limit: vi.fn().mockResolvedValue(result) };
  const afterWhere = { orderBy: vi.fn().mockReturnValue(afterOrderBy) };
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(afterWhere),
    afterWhere,
    afterOrderBy,
  };
}

describe('crmDashboardRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregate rows for the domain dashboard mapper', async () => {
    hoisted.dbSelect
      .mockReturnValueOnce(
        createGroupByChain([
          { stage: 'new', count: '3' },
          { stage: 'contacted', count: '7' },
        ])
      )
      .mockReturnValueOnce(createJoinSelectChain([{ count: '2' }]))
      .mockReturnValueOnce(createSelectChain([{ total: '123.45' }]))
      .mockReturnValueOnce(
        createDueFollowUpsChain([
          {
            activityId: 'activity-1',
            agentId: 'agent-1',
            branchId: 'branch-1',
            completedAt: null,
            companyName: null,
            createdAt: new Date('2026-05-10T08:00:00.000Z'),
            fullName: 'Lead One',
            leadId: 'lead-1',
            scheduledAt: new Date('2026-05-10T10:00:00.000Z'),
            subject: 'Call back',
            tenantId: 'tenant-1',
            type: 'follow_up',
          },
        ])
      )
      .mockReturnValueOnce(
        createDueFollowUpsChain([
          {
            activityId: 'task-1',
            agentId: 'agent-1',
            branchId: 'branch-1',
            companyName: 'Task Co',
            createdAt: new Date('2026-05-10T08:00:00.000Z'),
            expectedLifecycleVersion: 1,
            fullName: null,
            leadId: 'lead-2',
            scheduledAt: new Date('2026-05-10T11:00:00.000Z'),
            tenantId: 'tenant-1',
          },
        ])
      );

    const readModel = await crmDashboardRepository.readAgentDashboard({
      actor,
      limit: 5,
      now: '2026-05-12T08:00:00.000Z',
    });

    expect(readModel).toEqual({
      closedWonDealsCount: '2',
      dueFollowUps: [
        {
          activityId: 'activity-1',
          agentId: 'agent-1',
          branchId: 'branch-1',
          completedAt: null,
          companyName: null,
          createdAt: new Date('2026-05-10T08:00:00.000Z'),
          expectedLifecycleVersion: null,
          fullName: 'Lead One',
          leadId: 'lead-1',
          scheduledAt: new Date('2026-05-10T10:00:00.000Z'),
          source: 'legacy_activity',
          subject: 'Call back',
          tenantId: 'tenant-1',
          type: 'follow_up',
        },
        {
          activityId: 'task-1',
          agentId: 'agent-1',
          branchId: 'branch-1',
          companyName: 'Task Co',
          completedAt: null,
          createdAt: new Date('2026-05-10T08:00:00.000Z'),
          expectedLifecycleVersion: 1,
          fullName: null,
          leadId: 'lead-2',
          scheduledAt: new Date('2026-05-10T11:00:00.000Z'),
          source: 'crm_task',
          subject: 'Follow up',
          tenantId: 'tenant-1',
          type: 'follow_up',
        },
      ],
      leadCounts: [
        { stage: 'new', count: '3' },
        { stage: 'contacted', count: '7' },
      ],
      paidCommissionTotal: '123.45',
    });
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

    await crmDashboardRepository.readAgentDashboard({
      actor,
      limit: 5,
      now: '2026-05-12T08:00:00.000Z',
    });

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

  it('fails closed before querying when branch scope is missing', async () => {
    await expect(
      crmDashboardRepository.readAgentDashboard({
        actor: { ...actor, scope: { agentId: 'agent-1', branchId: null } },
        limit: 5,
        now: '2026-05-12T08:00:00.000Z',
      })
    ).rejects.toThrow('CRM dashboard read requires actor branch scope');

    expect(hoisted.dbSelect).not.toHaveBeenCalled();
  });
});
