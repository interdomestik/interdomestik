import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActionContext: vi.fn(),
  getMyCommissionsCore: vi.fn(),
  getMyCommissionSummaryCore: vi.fn(),
}));

vi.mock('./commissions/context', () => ({
  getActionContext: () => mocks.getActionContext(),
}));

vi.mock('./commissions/get-my', () => ({
  getMyCommissionsCore: (...args: unknown[]) => mocks.getMyCommissionsCore(...args),
}));

vi.mock('./commissions/summary', () => ({
  getMyCommissionSummaryCore: (...args: unknown[]) => mocks.getMyCommissionSummaryCore(...args),
}));

let actions: typeof import('./commissions');

describe('commissions action wrappers', () => {
  const authority = mintTestTenantAuthority('tenant-1');

  beforeAll(async () => {
    actions = await import('./commissions');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMyCommissions delegates to core with session from context', async () => {
    const session = { user: { id: 'a1', role: 'agent' } };
    mocks.getActionContext.mockResolvedValue({ session, authority });
    mocks.getMyCommissionsCore.mockResolvedValue({ success: true, data: [] });

    const result = await actions.getMyCommissions();

    expect(mocks.getMyCommissionsCore).toHaveBeenCalledWith({ session, authority });
    expect(result).toEqual({ success: true, data: [] });
  });

  it('getMyCommissionSummary delegates to core with session from context', async () => {
    const session = { user: { id: 'a1', role: 'agent' } };
    mocks.getActionContext.mockResolvedValue({ session, authority });
    mocks.getMyCommissionSummaryCore.mockResolvedValue({
      success: true,
      data: {
        totalPending: 0,
        totalApproved: 0,
        totalPaid: 0,
        pendingCount: 0,
        approvedCount: 0,
        paidCount: 0,
      },
    });

    const result = await actions.getMyCommissionSummary();

    expect(mocks.getMyCommissionSummaryCore).toHaveBeenCalledWith({ session, authority });
    expect(result.success).toBe(true);
    expect(result.data?.paidCount).toBe(0);
  });

  it('exposes only the two read actions of the current agent', () => {
    expect(Object.keys(actions).sort()).toEqual(['getMyCommissionSummary', 'getMyCommissions']);
  });
});
