import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getAgentCrmLeadDetail: vi.fn(),
  createCrmLeadDetailRepository: vi.fn(),
  crmLeadDetailRepository: {
    findAgentLead: vi.fn(),
    listAgentLeadDeals: vi.fn(),
  },
}));

vi.mock('@interdomestik/domain-crm/lead-details', () => ({
  getAgentCrmLeadDetail: hoisted.getAgentCrmLeadDetail,
}));

vi.mock('@/adapters/crm/lead-detail-repository', () => ({
  createCrmLeadDetailRepository: hoisted.createCrmLeadDetailRepository,
}));

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import { AgentLeadDetailsAccessDeniedError, getAgentLeadDetailsCore } from './_core';

const authority = mintTestTenantAuthority('tenant-1');
const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

describe('getAgentLeadDetailsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.createCrmLeadDetailRepository.mockReturnValue(hoisted.crmLeadDetailRepository);
    hoisted.getAgentCrmLeadDetail.mockResolvedValue({
      success: true,
      lead: { id: 'lead-1', agentId: 'agent-1', branchId: 'branch-1', tenantId: 'tenant-1' },
      deals: [{ id: 'deal-1', agentId: 'agent-1', leadId: 'lead-1', tenantId: 'tenant-1' }],
    });
  });

  it('delegates lead detail reads to the domain CRM lead-detail API with actor context', async () => {
    const result = await getAgentLeadDetailsCore({ actor, authority, leadId: 'lead-1' });

    expect(result).toEqual({
      kind: 'ok',
      lead: { id: 'lead-1', agentId: 'agent-1', branchId: 'branch-1', tenantId: 'tenant-1' },
      deals: [{ id: 'deal-1', agentId: 'agent-1', leadId: 'lead-1', tenantId: 'tenant-1' }],
    });
    expect(hoisted.createCrmLeadDetailRepository).toHaveBeenCalledWith(authority);
    expect(hoisted.getAgentCrmLeadDetail).toHaveBeenCalledWith(
      { actor, leadId: 'lead-1' },
      hoisted.crmLeadDetailRepository
    );
  });

  it('maps absent scoped leads to not_found', async () => {
    hoisted.getAgentCrmLeadDetail.mockResolvedValueOnce({ success: false, error: 'not_found' });

    const result = await getAgentLeadDetailsCore({ actor, authority, leadId: 'lead-1' });

    expect(result).toEqual({ kind: 'not_found' });
  });

  it('raises a typed access-denied error when the domain CRM lead-detail read is forbidden', async () => {
    hoisted.getAgentCrmLeadDetail.mockResolvedValueOnce({
      success: false,
      error: 'forbidden',
      reason: 'branch_scope',
    });

    try {
      await getAgentLeadDetailsCore({ actor, authority, leadId: 'lead-1' });
      throw new Error('Expected getAgentLeadDetailsCore to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AgentLeadDetailsAccessDeniedError);
      expect(error).toMatchObject({
        name: 'AgentLeadDetailsAccessDeniedError',
        reason: 'branch_scope',
      });
    }
  });
});
