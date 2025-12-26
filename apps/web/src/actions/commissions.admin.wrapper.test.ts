import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAllCommissionsCore: vi.fn(),
  getGlobalCommissionSummaryCore: vi.fn(),
  updateCommissionStatusCore: vi.fn(),
  bulkApproveCommissionsCore: vi.fn(),
}));

vi.mock('./commissions-admin/get-all', () => ({
  getAllCommissionsCore: (...args: unknown[]) => mocks.getAllCommissionsCore(...args),
}));

vi.mock('./commissions-admin/summary', () => ({
  getGlobalCommissionSummaryCore: (...args: unknown[]) =>
    mocks.getGlobalCommissionSummaryCore(...args),
}));

vi.mock('./commissions-admin/update-status', () => ({
  updateCommissionStatusCore: (...args: unknown[]) => mocks.updateCommissionStatusCore(...args),
}));

vi.mock('./commissions-admin/bulk-approve', () => ({
  bulkApproveCommissionsCore: (...args: unknown[]) => mocks.bulkApproveCommissionsCore(...args),
}));

vi.mock('./commissions-admin/context', () => ({
  getActionContext: vi.fn(async () => ({
    requestHeaders: new Headers(),
    session: { user: { id: 'admin-1', role: 'admin' } },
  })),
}));

let actions: typeof import('./commissions.admin');

describe('commissions.admin action wrappers', () => {
  beforeAll(async () => {
    actions = await import('./commissions.admin');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAllCommissions delegates to core', async () => {
    mocks.getAllCommissionsCore.mockResolvedValue({ success: true, data: [] });

    const result = await actions.getAllCommissions();

    expect(mocks.getAllCommissionsCore).toHaveBeenCalledWith({
      session: { user: { id: 'admin-1', role: 'admin' } },
    });
    expect(result).toEqual({ success: true, data: [] });
  });

  it('getGlobalCommissionSummary delegates to core', async () => {
    mocks.getGlobalCommissionSummaryCore.mockResolvedValue({
      success: true,
      data: {
        totalPending: 1,
        totalApproved: 2,
        totalPaid: 3,
        pendingCount: 1,
        approvedCount: 1,
        paidCount: 1,
      },
    });

    const result = await actions.getGlobalCommissionSummary();

    expect(mocks.getGlobalCommissionSummaryCore).toHaveBeenCalledWith({
      session: { user: { id: 'admin-1', role: 'admin' } },
    });
    expect(result.success).toBe(true);
    expect(result.data?.totalPaid).toBe(3);
  });

  it('updateCommissionStatus delegates to core', async () => {
    mocks.updateCommissionStatusCore.mockResolvedValue({ success: true });

    const result = await actions.updateCommissionStatus('c1', 'paid');

    expect(mocks.updateCommissionStatusCore).toHaveBeenCalledWith({
      session: { user: { id: 'admin-1', role: 'admin' } },
      commissionId: 'c1',
      newStatus: 'paid',
    });
    expect(result).toEqual({ success: true });
  });

  it('bulkApproveCommissions delegates to core', async () => {
    mocks.bulkApproveCommissionsCore.mockResolvedValue({ success: true, data: { count: 2 } });

    const result = await actions.bulkApproveCommissions(['c1', 'c2']);

    expect(mocks.bulkApproveCommissionsCore).toHaveBeenCalledWith({
      session: { user: { id: 'admin-1', role: 'admin' } },
      ids: ['c1', 'c2'],
    });
    expect(result).toEqual({ success: true, data: { count: 2 } });
  });
});
