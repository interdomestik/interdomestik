import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActionContext: vi.fn(),
  getMyCommissionsCore: vi.fn(),
  getMyCommissionSummaryCore: vi.fn(),
  createCommissionCore: vi.fn(),
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

vi.mock('./commissions/create', () => ({
  createCommissionCore: (...args: unknown[]) => mocks.createCommissionCore(...args),
}));

let actions: typeof import('./commissions');

describe('commissions action wrappers', () => {
  beforeAll(async () => {
    actions = await import('./commissions');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMyCommissions delegates to core with session from context', async () => {
    const session = { user: { id: 'a1', role: 'agent' } };
    mocks.getActionContext.mockResolvedValue({ session });
    mocks.getMyCommissionsCore.mockResolvedValue({ success: true, data: [] });

    const result = await actions.getMyCommissions();

    expect(mocks.getMyCommissionsCore).toHaveBeenCalledWith({ session });
    expect(result).toEqual({ success: true, data: [] });
  });

  it('getMyCommissionSummary delegates to core with session from context', async () => {
    const session = { user: { id: 'a1', role: 'agent' } };
    mocks.getActionContext.mockResolvedValue({ session });
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

    expect(mocks.getMyCommissionSummaryCore).toHaveBeenCalledWith({ session });
    expect(result.success).toBe(true);
    expect(result.data?.paidCount).toBe(0);
  });

  it('createCommission delegates to core with same params', async () => {
    const payload = {
      agentId: 'agent-1',
      memberId: 'member-1',
      subscriptionId: 'sub-1',
      type: 'new_membership' as const,
      amount: 12.34,
      currency: 'EUR',
      metadata: { source: 'test' },
    };

    mocks.createCommissionCore.mockResolvedValue({ success: true, data: { id: 'c1' } });

    const result = await actions.createCommission(payload);

    expect(mocks.createCommissionCore).toHaveBeenCalledWith(payload);
    expect(result).toEqual({ success: true, data: { id: 'c1' } });
  });
});
