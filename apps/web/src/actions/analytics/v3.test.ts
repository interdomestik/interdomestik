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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runAuthenticatedAction.mockImplementation(async callback =>
      callback({
        userRole: 'super_admin',
        tenantId: 'tenant-1',
      })
    );
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
});
