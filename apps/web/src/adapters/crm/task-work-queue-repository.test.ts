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
  crmLeads: {
    agentId: 'crmLeads.agentId',
    branchId: 'crmLeads.branchId',
    companyName: 'crmLeads.companyName',
    fullName: 'crmLeads.fullName',
    id: 'crmLeads.id',
    tenantId: 'crmLeads.tenantId',
  },
  crmTasks: {
    assignedActorId: 'crmTasks.assignedActorId',
    assignedKind: 'crmTasks.assignedKind',
    branchId: 'crmTasks.branchId',
    completedAt: 'crmTasks.completedAt',
    completionReasonCode: 'crmTasks.completionReasonCode',
    createReasonCode: 'crmTasks.createReasonCode',
    dueAt: 'crmTasks.dueAt',
    id: 'crmTasks.id',
    lifecycleVersion: 'crmTasks.lifecycleVersion',
    priority: 'crmTasks.priority',
    status: 'crmTasks.status',
    subjectId: 'crmTasks.subjectId',
    subjectKind: 'crmTasks.subjectKind',
    tenantId: 'crmTasks.tenantId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  asc: vi.fn((col: unknown) => ({ asc: col })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ inArray: [col, vals] })),
  isNotNull: vi.fn((col: unknown) => ({ isNotNull: col })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: { strings, values } }),
}));

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import { createAgentCrmTaskWorkQueueRepository } from './task-work-queue-repository';

const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function createQueueChain(result: unknown) {
  const afterOrderBy = { limit: vi.fn().mockResolvedValue(result) };
  const afterWhere = { orderBy: vi.fn().mockReturnValue(afterOrderBy) };
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(afterWhere),
    afterOrderBy,
    afterWhere,
  };
}

describe('createAgentCrmTaskWorkQueueRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a PII-bounded task-only work queue DTO', async () => {
    hoisted.dbSelect.mockReturnValueOnce(
      createQueueChain([
        {
          assignedActorId: 'agent-1',
          branchId: 'branch-1',
          companyName: 'Lead Co',
          createReasonCode: 'follow_up',
          dueAt: new Date('2026-05-22T12:00:00.000Z'),
          fullName: null,
          leadId: 'lead-1',
          lifecycleVersion: 3,
          priority: 'urgent',
          status: 'pending',
          taskId: 'task-1',
          tenantId: 'tenant-1',
        },
      ])
    );

    const queue = await createAgentCrmTaskWorkQueueRepository().readAgentTaskWorkQueue({
      actor,
      now: '2026-05-22T08:00:00.000Z',
    });

    expect(queue).toEqual([
      {
        createReasonCode: 'follow_up',
        displayLabelCode: 'follow_up',
        dueAt: '2026-05-22T12:00:00.000Z',
        dueBucket: 'due_today',
        leadDisplayRef: { id: 'lead-1', label: 'Lead Co' },
        lifecycleVersion: 3,
        priority: 'urgent',
        status: 'pending',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: 'task-1',
      },
    ]);
  });

  it('constrains reads by tenant, branch, actor assignment, open status, and lead subject', async () => {
    const chain = createQueueChain([]);
    hoisted.dbSelect.mockReturnValueOnce(chain);

    await createAgentCrmTaskWorkQueueRepository().readAgentTaskWorkQueue({
      actor,
      now: '2026-05-22T08:00:00.000Z',
    });

    expect(chain.innerJoin).toHaveBeenCalledWith(expect.objectContaining({ id: 'crmLeads.id' }), {
      and: [
        { eq: ['crmLeads.id', 'crmTasks.subjectId'] },
        { eq: ['crmLeads.tenantId', 'tenant-1'] },
        { eq: ['crmLeads.agentId', 'agent-1'] },
        { eq: ['crmLeads.branchId', 'branch-1'] },
      ],
    });
    expect(chain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmTasks.tenantId', 'tenant-1'] },
        { eq: ['crmTasks.branchId', 'branch-1'] },
        { eq: ['crmTasks.subjectKind', 'lead'] },
        { eq: ['crmTasks.assignedKind', 'actor'] },
        { eq: ['crmTasks.assignedActorId', 'agent-1'] },
        { inArray: ['crmTasks.status', ['pending', 'in_progress']] },
      ],
    });
    expect(chain.afterWhere.orderBy).toHaveBeenCalledWith(
      expect.objectContaining({ sql: expect.any(Object) }),
      { asc: 'crmTasks.dueAt' },
      expect.objectContaining({ sql: expect.any(Object) }),
      { asc: 'crmTasks.id' }
    );
    expect(chain.afterOrderBy.limit).toHaveBeenCalledWith(20);
  });

  it('fails closed without querying for unsupported actor scope', async () => {
    await expect(
      createAgentCrmTaskWorkQueueRepository().readAgentTaskWorkQueue({
        actor: { ...actor, role: 'staff' },
        now: '2026-05-22T08:00:00.000Z',
      })
    ).resolves.toEqual([]);

    expect(hoisted.dbSelect).not.toHaveBeenCalled();
  });

  it('returns a distinct completed task recovery queue DTO', async () => {
    hoisted.dbSelect.mockReturnValueOnce(
      createQueueChain([
        {
          assignedActorId: 'agent-1',
          branchId: 'branch-1',
          companyName: null,
          completedAt: new Date('2026-05-22T12:00:00.000Z'),
          completionReasonCode: 'resolved',
          dueAt: null,
          fullName: 'Lead Person',
          leadId: 'lead-1',
          lifecycleVersion: 4,
          priority: 'normal',
          status: 'completed',
          taskId: 'task-1',
          tenantId: 'tenant-1',
        },
      ])
    );

    const queue = await createAgentCrmTaskWorkQueueRepository().readAgentCompletedTaskQueue({
      actor,
      now: '2026-05-22T08:00:00.000Z',
    });

    expect(queue).toEqual([
      {
        completedAt: '2026-05-22T12:00:00.000Z',
        completionReasonCode: 'resolved',
        dueAt: null,
        leadDisplayRef: { id: 'lead-1', label: 'Lead Person' },
        lifecycleVersion: 4,
        priority: 'normal',
        status: 'completed',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: 'task-1',
      },
    ]);
  });

  it('constrains completed queue reads to completed lead-backed assigned rows', async () => {
    const chain = createQueueChain([]);
    hoisted.dbSelect.mockReturnValueOnce(chain);

    await createAgentCrmTaskWorkQueueRepository().readAgentCompletedTaskQueue({
      actor,
      now: '2026-05-22T08:00:00.000Z',
    });

    expect(chain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmTasks.tenantId', 'tenant-1'] },
        { eq: ['crmTasks.branchId', 'branch-1'] },
        { eq: ['crmTasks.subjectKind', 'lead'] },
        { eq: ['crmTasks.assignedKind', 'actor'] },
        { eq: ['crmTasks.assignedActorId', 'agent-1'] },
        { eq: ['crmTasks.status', 'completed'] },
        { isNotNull: 'crmTasks.completedAt' },
      ],
    });
    expect(chain.afterWhere.orderBy).toHaveBeenCalledWith(
      { desc: 'crmTasks.completedAt' },
      { asc: 'crmTasks.id' }
    );
    expect(chain.afterOrderBy.limit).toHaveBeenCalledWith(10);
  });
});
