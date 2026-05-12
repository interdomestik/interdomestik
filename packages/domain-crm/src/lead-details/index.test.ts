import { describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import {
  authorizeAgentCrmLeadDetailRead,
  getAgentCrmLeadDetail,
  type AgentCrmLeadDetailRepository,
} from './index';

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

type LeadRow = {
  agentId: string;
  branchId: string | null;
  id: string;
  tenantId: string;
};

type DealRow = {
  agentId: string;
  id: string;
  leadId: string;
  tenantId: string;
};

function lead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    id: 'lead-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function repository(
  foundLead: LeadRow | null = lead()
): AgentCrmLeadDetailRepository<LeadRow, DealRow> {
  return {
    findAgentLead: vi.fn(async () => foundLead),
    listAgentLeadDeals: vi.fn(async () => [
      {
        agentId: 'agent-1',
        id: 'deal-1',
        leadId: 'lead-1',
        tenantId: 'tenant-1',
      },
    ]),
  };
}

describe('getAgentCrmLeadDetail', () => {
  it('rejects non-agent actors before reading lead details', async () => {
    const repo = repository();

    const result = await getAgentCrmLeadDetail(
      {
        actor: {
          ...agentActor,
          role: 'staff',
          scope: { branchId: 'branch-1', staffId: 'staff-1' },
        },
        leadId: 'lead-1',
      },
      repo
    );

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'role_scope' });
    expect(repo.findAgentLead).not.toHaveBeenCalled();
    expect(repo.listAgentLeadDeals).not.toHaveBeenCalled();
  });

  it('rejects wrong-agent actor scope before reading lead details', async () => {
    const repo = repository();

    const result = await getAgentCrmLeadDetail(
      {
        actor: { ...agentActor, scope: { ...agentActor.scope, agentId: 'agent-2' } },
        leadId: 'lead-1',
      },
      repo
    );

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'agent_scope' });
    expect(repo.findAgentLead).not.toHaveBeenCalled();
    expect(repo.listAgentLeadDeals).not.toHaveBeenCalled();
  });

  it('rejects missing branch scope before reading lead details', async () => {
    const repo = repository();

    const result = await getAgentCrmLeadDetail(
      {
        actor: { ...agentActor, scope: { agentId: 'agent-1', branchId: null } },
        leadId: 'lead-1',
      },
      repo
    );

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'branch_scope' });
    expect(repo.findAgentLead).not.toHaveBeenCalled();
    expect(repo.listAgentLeadDeals).not.toHaveBeenCalled();
  });

  it('returns not_found without reading deals when the scoped lead is absent', async () => {
    const repo = repository(null);

    const result = await getAgentCrmLeadDetail({ actor: agentActor, leadId: 'lead-1' }, repo);

    expect(result).toEqual({ success: false, error: 'not_found' });
    expect(repo.findAgentLead).toHaveBeenCalledWith({ actor: agentActor, leadId: 'lead-1' });
    expect(repo.listAgentLeadDeals).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant leads before deal data is returned', async () => {
    const repo = repository(lead({ tenantId: 'tenant-2' }));

    const result = await getAgentCrmLeadDetail({ actor: agentActor, leadId: 'lead-1' }, repo);

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'tenant_scope' });
    expect(repo.listAgentLeadDeals).not.toHaveBeenCalled();
  });

  it('rejects wrong-agent leads before deal data is returned', async () => {
    const repo = repository(lead({ agentId: 'agent-2' }));

    const result = await getAgentCrmLeadDetail({ actor: agentActor, leadId: 'lead-1' }, repo);

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'agent_scope' });
    expect(repo.listAgentLeadDeals).not.toHaveBeenCalled();
  });

  it('rejects wrong-branch leads before deal data is returned', async () => {
    const repo = repository(lead({ branchId: 'branch-2' }));

    const result = await getAgentCrmLeadDetail({ actor: agentActor, leadId: 'lead-1' }, repo);

    expect(result).toEqual({ success: false, error: 'forbidden', reason: 'branch_scope' });
    expect(repo.listAgentLeadDeals).not.toHaveBeenCalled();
  });

  it('returns authorized lead detail rows through the repository', async () => {
    const repo = repository();

    const result = await getAgentCrmLeadDetail({ actor: agentActor, leadId: 'lead-1' }, repo);

    expect(result).toEqual({
      success: true,
      lead: lead(),
      deals: [
        {
          agentId: 'agent-1',
          id: 'deal-1',
          leadId: 'lead-1',
          tenantId: 'tenant-1',
        },
      ],
    });
    expect(repo.listAgentLeadDeals).toHaveBeenCalledWith({ actor: agentActor, lead: lead() });
  });

  it('exposes explicit authorization reasons for direct guard tests', () => {
    expect(authorizeAgentCrmLeadDetailRead(agentActor)).toBeNull();
    expect(authorizeAgentCrmLeadDetailRead({ ...agentActor, role: 'member' })).toBe('role_scope');
    expect(
      authorizeAgentCrmLeadDetailRead({
        ...agentActor,
        scope: { ...agentActor.scope, agentId: 'agent-2' },
      })
    ).toBe('agent_scope');
    expect(
      authorizeAgentCrmLeadDetailRead({
        ...agentActor,
        scope: { ...agentActor.scope, branchId: undefined },
      })
    ).toBe('branch_scope');
    expect(authorizeAgentCrmLeadDetailRead(agentActor, lead({ tenantId: 'tenant-2' }))).toBe(
      'tenant_scope'
    );
    expect(authorizeAgentCrmLeadDetailRead(agentActor, lead({ agentId: 'agent-2' }))).toBe(
      'agent_scope'
    );
    expect(authorizeAgentCrmLeadDetailRead(agentActor, lead({ branchId: 'branch-2' }))).toBe(
      'branch_scope'
    );
  });
});
