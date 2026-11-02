import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const dbSelect = vi.fn();
  const db = { select: dbSelect };
  return {
    db,
    dbSelect,
    withTenantContext: vi.fn(async (_context: unknown, callback: (tx: typeof db) => unknown) =>
      callback(db)
    ),
  };
});

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('@interdomestik/database/db', () => ({
  db: hoisted.db,
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
