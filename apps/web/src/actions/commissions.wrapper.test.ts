import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActionContext: vi.fn(),
  getMyCommissionsCore: vi.fn(),
  getMyCommissionSummaryCore: vi.fn(),
  createCommissionCore: vi.fn(),
  ensureTenantId: vi.fn(),
}));

vi.mock('./commissions/context', () => ({
  getActionContext: () => mocks.getActionContext(),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: (...args: unknown[]) => mocks.ensureTenantId(...args),
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

  it('createCommission delegates to core with session-derived tenantId', async () => {
    const payload = {
      agentId: 'agent-1',
      memberId: 'member-1',
      subscriptionId: 'sub-1',
      type: 'new_membership' as const,
      amount: 12.34,
      currency: 'EUR',
      metadata: { source: 'test' },
    };
    const session = { user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' } };

    mocks.getActionContext.mockResolvedValue({ session });
    mocks.ensureTenantId.mockReturnValue('tenant-1');
    mocks.createCommissionCore.mockResolvedValue({ success: true, data: { id: 'c1' } });

    const result = await actions.createCommission(payload);

    expect(mocks.ensureTenantId).toHaveBeenCalledWith(session);
    expect(mocks.createCommissionCore).toHaveBeenCalledWith({ ...payload, tenantId: 'tenant-1' });
    expect(result).toEqual({ success: true, data: { id: 'c1' } });
  });

  it('createCommission fails before core execution when session has no tenantId', async () => {
    mocks.getActionContext.mockResolvedValue({
      session: { user: { id: 'admin-1', role: 'admin', tenantId: null } },
    });
    mocks.ensureTenantId.mockImplementation(() => {
      throw new Error('Missing tenant');
    });

    const result = await actions.createCommission({
      agentId: 'agent-1',
      type: 'new_membership',
      amount: 12.34,
    });

    expect(result).toEqual({ success: false, error: 'Missing tenantId' });
    expect(mocks.createCommissionCore).not.toHaveBeenCalled();
  });

  it('createCommission returns unauthorized before tenant proof when session is missing', async () => {
    mocks.getActionContext.mockResolvedValue({ session: null });

    const result = await actions.createCommission({
      agentId: 'agent-1',
      type: 'new_membership',
      amount: 12.34,
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.ensureTenantId).not.toHaveBeenCalled();
    expect(mocks.createCommissionCore).not.toHaveBeenCalled();
  });
});
