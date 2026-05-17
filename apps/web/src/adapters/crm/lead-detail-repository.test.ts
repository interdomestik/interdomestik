import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  findLeadFirst: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    query: {
      crmLeads: {
        findFirst: hoisted.findLeadFirst,
      },
    },
    select: hoisted.dbSelect,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  crmDeals: {
    agentId: 'crmDeals.agentId',
    leadId: 'crmDeals.leadId',
    tenantId: 'crmDeals.tenantId',
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
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
}));

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import { crmLeadDetailRepository } from './lead-detail-repository';
import type { AgentCrmLeadDetailLeadRow } from './lead-detail-repository';

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

describe('crmLeadDetailRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters lead reads by tenant, agent, and durable branch custody', async () => {
    hoisted.findLeadFirst.mockResolvedValueOnce({ id: 'lead-1' });

    await crmLeadDetailRepository.findAgentLead({ actor, leadId: 'lead-1' });

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

  it('filters deal reads by tenant and agent after receiving an authorized lead', async () => {
    const chain = createSelectChain([{ id: 'deal-1' }]);
    hoisted.dbSelect.mockReturnValueOnce(chain);

    await crmLeadDetailRepository.listAgentLeadDeals({
      actor,
      lead: {
        id: 'lead-1',
        agentId: 'agent-1',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      } as AgentCrmLeadDetailLeadRow,
    });

    expect(chain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmDeals.leadId', 'lead-1'] },
        { eq: ['crmDeals.tenantId', 'tenant-1'] },
        { eq: ['crmDeals.agentId', 'agent-1'] },
      ],
    });
  });

  it('fails closed before querying when branch scope is missing', async () => {
    await expect(
      crmLeadDetailRepository.findAgentLead({
        actor: { ...actor, scope: { agentId: 'agent-1', branchId: null } },
        leadId: 'lead-1',
      })
    ).rejects.toThrow('CRM lead detail read requires actor branch scope');
    expect(hoisted.findLeadFirst).not.toHaveBeenCalled();

    await expect(
      crmLeadDetailRepository.listAgentLeadDeals({
        actor: { ...actor, scope: { agentId: 'agent-1', branchId: null } },
        lead: {
          id: 'lead-1',
          agentId: 'agent-1',
          branchId: 'branch-1',
          tenantId: 'tenant-1',
        } as AgentCrmLeadDetailLeadRow,
      })
    ).rejects.toThrow('CRM lead detail read requires actor branch scope');
    expect(hoisted.dbSelect).not.toHaveBeenCalled();
  });
});
