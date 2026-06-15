import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAgentCapacitySignal: vi.fn(),
  getBranchStressIndex: vi.fn(),
  runAuthenticatedAction: vi.fn(),
}));

vi.mock('@/lib/safe-action', () => ({
  runAuthenticatedAction: mocks.runAuthenticatedAction,
}));

vi.mock('@interdomestik/domain-analytics', () => ({
  getAgentCapacitySignal: mocks.getAgentCapacitySignal,
  getBranchStressIndex: mocks.getBranchStressIndex,
  getClaimLoadForecast: vi.fn(),
}));

import { getAgentCapacityAction, getBranchStressAction } from './v3';

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
  });

  it('keeps super admins authorized for branch stress', async () => {
    await expect(getBranchStressAction('branch-1')).resolves.toEqual({ branchId: 'branch-1' });
    expect(mocks.getBranchStressIndex).toHaveBeenCalledWith('tenant-1', 'branch-1');
  });

  it('keeps super admins authorized for agent capacity', async () => {
    await expect(getAgentCapacityAction('agent-1')).resolves.toEqual({ agentId: 'agent-1' });
    expect(mocks.getAgentCapacitySignal).toHaveBeenCalledWith('agent-1');
  });

  it('rejects branch managers from agent capacity analytics', async () => {
    actionContext = { ...actionContext, userRole: 'branch_manager' };

    await expect(getAgentCapacityAction('agent-1')).rejects.toThrow('Unauthorized');
    expect(mocks.getAgentCapacitySignal).not.toHaveBeenCalled();
  });
});
