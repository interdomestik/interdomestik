import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getAgentCrmDashboard: vi.fn(),
  crmDashboardRepository: { readAgentDashboard: vi.fn() },
}));

vi.mock('@interdomestik/domain-crm/dashboards', () => ({
  getAgentCrmDashboard: hoisted.getAgentCrmDashboard,
}));

vi.mock('@/lib/domain-crm/dashboard-repository', () => ({
  crmDashboardRepository: hoisted.crmDashboardRepository,
}));

import type { CrmActorContext } from '@interdomestik/domain-crm/context';

import { AgentCrmStatsAccessDeniedError, getAgentCrmStatsCore } from './_core';

const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

describe('getAgentCrmStatsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getAgentCrmDashboard.mockResolvedValue({
      success: true,
      dashboard: {
        closedWonDealsCount: 0,
        contactedLeadsCount: 0,
        dueFollowUps: [],
        newLeadsCount: 0,
        paidCommissionTotal: 0,
      },
    });
  });

  it('delegates dashboard reads to the domain CRM dashboard API with actor context', async () => {
    const stats = await getAgentCrmStatsCore({ actor });

    expect(stats).toEqual({
      closedWonDealsCount: 0,
      contactedLeadsCount: 0,
      dueFollowUps: [],
      newLeadsCount: 0,
      paidCommissionTotal: 0,
    });
    expect(hoisted.getAgentCrmDashboard).toHaveBeenCalledWith(
      { actor },
      hoisted.crmDashboardRepository,
      { now: expect.any(Function) }
    );
  });

  it('raises a typed access-denied error when the domain CRM dashboard read is forbidden', async () => {
    hoisted.getAgentCrmDashboard.mockResolvedValueOnce({
      success: false,
      error: 'forbidden',
      reason: 'branch_scope',
    });

    try {
      await getAgentCrmStatsCore({ actor });
      throw new Error('Expected getAgentCrmStatsCore to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AgentCrmStatsAccessDeniedError);
      expect(error).toMatchObject({
        reason: 'branch_scope',
        name: 'AgentCrmStatsAccessDeniedError',
      });
    }
  });
});
