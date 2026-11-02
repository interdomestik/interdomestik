import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAgentCapacitySignal: vi.fn(),
  getBranchStressIndex: vi.fn(),
  getClaimLoadForecast: vi.fn(),
  runAuthenticatedAction: vi.fn(),
}));

vi.mock('@/lib/safe-action', () => ({
  runAuthenticatedAction: mocks.runAuthenticatedAction,
}));

vi.mock('@interdomestik/domain-analytics', () => ({
  getAgentCapacitySignal: mocks.getAgentCapacitySignal,
  getBranchStressIndex: mocks.getBranchStressIndex,
  getClaimLoadForecast: mocks.getClaimLoadForecast,
}));

import { getAgentCapacityAction, getBranchStressAction, getClaimLoadForecastAction } from './v3';

describe('analytics v3 actions role boundaries', () => {
  let actionContext: {
    userRole: string;
    tenantId: string;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    actionContext = {
      userRole: 'super_admin',
      tenantId: 'tenant-1',
    };
    mocks.runAuthenticatedAction.mockImplementation(async callback => callback(actionContext));
    mocks.getAgentCapacitySignal.mockResolvedValue({ agentId: 'agent-1' });
    mocks.getBranchStressIndex.mockResolvedValue({ branchId: 'branch-1' });
    mocks.getClaimLoadForecast.mockResolvedValue({ trend: 'stable' });
  });

  it('passes the super admin role as the actor for the claim load forecast', async () => {
    await expect(getClaimLoadForecastAction()).resolves.toEqual({ trend: 'stable' });
    expect(mocks.getClaimLoadForecast).toHaveBeenCalledWith({ role: 'super_admin' });
  });

  it.each(['tenant_admin', 'staff', 'branch_manager', 'member'])(
    'rejects %s from the claim load forecast before the domain call',
    async userRole => {
      actionContext = { ...actionContext, userRole };

      await expect(getClaimLoadForecastAction()).rejects.toThrow('Unauthorized');
      expect(mocks.getClaimLoadForecast).not.toHaveBeenCalled();
    }
  );

  it('keeps super admins authorized for branch stress', async () => {
    await expect(getBranchStressAction('branch-1')).resolves.toEqual({ branchId: 'branch-1' });
    expect(mocks.getBranchStressIndex).toHaveBeenCalledWith('tenant-1', 'branch-1');
  });

  it('keeps super admins authorized for agent capacity', async () => {
    await expect(getAgentCapacityAction('agent-1')).resolves.toEqual({ agentId: 'agent-1' });
    expect(mocks.getAgentCapacitySignal).toHaveBeenCalledWith('tenant-1', 'agent-1');
  });

  it.each(['tenant_admin', 'staff'])(
    'binds agent capacity for %s to the session tenant',
    async userRole => {
      actionContext = { userRole, tenantId: 'tenant-9' };

      await getAgentCapacityAction('agent-7');

      expect(mocks.getAgentCapacitySignal).toHaveBeenCalledTimes(1);
      expect(mocks.getAgentCapacitySignal).toHaveBeenCalledWith('tenant-9', 'agent-7');
    }
  );

  it('rejects branch managers from agent capacity analytics', async () => {
    actionContext = { ...actionContext, userRole: 'branch_manager' };

    await expect(getAgentCapacityAction('agent-1')).rejects.toThrow('Unauthorized');
    expect(mocks.getAgentCapacitySignal).not.toHaveBeenCalled();
  });
});
