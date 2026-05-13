import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  findActivitiesMany: vi.fn(),
  findLeadFirst: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    query: {
      crmActivities: {
        findMany: hoisted.findActivitiesMany,
      },
      crmLeads: {
        findFirst: hoisted.findLeadFirst,
      },
    },
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  crmActivities: {
    agentId: 'crmActivities.agentId',
    branchId: 'crmActivities.branchId',
    completedAt: 'crmActivities.completedAt',
    createdAt: 'crmActivities.createdAt',
    id: 'crmActivities.id',
    leadId: 'crmActivities.leadId',
    occurredAt: 'crmActivities.occurredAt',
    scheduledAt: 'crmActivities.scheduledAt',
    summary: 'crmActivities.summary',
    tenantId: 'crmActivities.tenantId',
    type: 'crmActivities.type',
  },
  crmLeads: {
    agentId: 'crmLeads.agentId',
    branchId: 'crmLeads.branchId',
    id: 'crmLeads.id',
    tenantId: 'crmLeads.tenantId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((column: unknown) => ({ desc: column })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
}));

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import { crmLeadActivityRepository } from './lead-activity-repository';
import type { AgentCrmLeadActivityLeadRow } from './lead-activity-repository';

const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

describe('crmLeadActivityRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters parent lead reads by tenant, agent, and durable branch custody', async () => {
    hoisted.findLeadFirst.mockResolvedValueOnce({ id: 'lead-1' });

    await crmLeadActivityRepository.findAgentLead({ actor, leadId: 'lead-1' });

    expect(hoisted.findLeadFirst).toHaveBeenCalledWith({
      where: {
        and: [
          { eq: ['crmLeads.id', 'lead-1'] },
          { eq: ['crmLeads.tenantId', 'tenant-1'] },
          { eq: ['crmLeads.agentId', 'agent-1'] },
          { eq: ['crmLeads.branchId', 'branch-1'] },
        ],
      },
    });
  });

  it('filters activity reads by tenant, agent, lead, and activity branch snapshot', async () => {
    const createdAt = new Date('2026-05-12T10:00:00.000Z');
    hoisted.findActivitiesMany.mockResolvedValueOnce([
      {
        agent: { name: 'Agent One' },
        agentId: 'agent-1',
        branchId: 'branch-1',
        completedAt: null,
        createdAt,
        id: 'activity-1',
        leadId: 'lead-1',
        occurredAt: createdAt,
        scheduledAt: null,
        summary: 'Call lead',
        tenantId: 'tenant-1',
        type: 'call',
      },
    ]);

    const result = await crmLeadActivityRepository.listAgentLeadActivities({
      actor,
      lead: {
        id: 'lead-1',
        agentId: 'agent-1',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      } as AgentCrmLeadActivityLeadRow,
      limit: 25,
    });

    expect(hoisted.findActivitiesMany).toHaveBeenCalledWith({
      where: {
        and: [
          { eq: ['crmActivities.leadId', 'lead-1'] },
          { eq: ['crmActivities.tenantId', 'tenant-1'] },
          { eq: ['crmActivities.agentId', 'agent-1'] },
          { eq: ['crmActivities.branchId', 'branch-1'] },
        ],
      },
      columns: {
        agentId: true,
        branchId: true,
        completedAt: true,
        createdAt: true,
        id: true,
        leadId: true,
        occurredAt: true,
        scheduledAt: true,
        summary: true,
        tenantId: true,
        type: true,
      },
      limit: 25,
      orderBy: [{ desc: 'crmActivities.createdAt' }],
      with: {
        agent: {
          columns: { name: true },
        },
      },
    });
    expect(result).toEqual([
      {
        agent: { name: 'Agent One' },
        agentId: 'agent-1',
        branchId: 'branch-1',
        completedAt: null,
        createdAt: '2026-05-12T10:00:00.000Z',
        description: null,
        id: 'activity-1',
        leadId: 'lead-1',
        occurredAt: '2026-05-12T10:00:00.000Z',
        scheduledAt: null,
        subject: 'Call lead',
        tenantId: 'tenant-1',
        type: 'call',
      },
    ]);
  });

  it('fails closed before querying when branch scope is missing', async () => {
    const branchlessActor = { ...actor, scope: { agentId: 'agent-1', branchId: null } };

    await expect(
      crmLeadActivityRepository.findAgentLead({ actor: branchlessActor, leadId: 'lead-1' })
    ).rejects.toThrow('CRM lead activity read requires actor branch scope');
    expect(hoisted.findLeadFirst).not.toHaveBeenCalled();

    await expect(
      crmLeadActivityRepository.listAgentLeadActivities({
        actor: branchlessActor,
        lead: {
          id: 'lead-1',
          agentId: 'agent-1',
          branchId: 'branch-1',
          tenantId: 'tenant-1',
        } as AgentCrmLeadActivityLeadRow,
        limit: 25,
      })
    ).rejects.toThrow('CRM lead activity read requires actor branch scope');
    expect(hoisted.findActivitiesMany).not.toHaveBeenCalled();
  });
});
