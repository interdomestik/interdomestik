import { describe, expect, it, vi } from 'vitest';

import { getAdminAnalytics } from './analytics';

vi.mock('./analytics/context', () => ({
  getActionContext: vi.fn(),
}));

vi.mock('./analytics/get-admin', () => ({
  getAdminAnalyticsCore: vi.fn(),
}));

describe('actions/analytics wrapper', () => {
  it('delegates to core with session from context', async () => {
    const { getActionContext } = await import('./analytics/context');
    const { getAdminAnalyticsCore } = await import('./analytics/get-admin');

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'u1', role: 'admin' } },
    });

    (getAdminAnalyticsCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        mrr: 0,
        totalMembers: 0,
        activeMembers: 0,
        churnRate: 0,
        recentSales: [],
        memberGrowth: [],
      },
      error: undefined,
    });

    const result = await getAdminAnalytics();

    expect(getAdminAnalyticsCore).toHaveBeenCalledTimes(1);
    expect(getAdminAnalyticsCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1', role: 'admin' } },
    });
    expect(result.success).toBe(true);
  });
});
