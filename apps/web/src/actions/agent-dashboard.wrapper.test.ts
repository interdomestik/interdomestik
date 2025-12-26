import { describe, expect, it, vi } from 'vitest';

import { getAgentDashboardData } from './agent-dashboard';

vi.mock('./agent-dashboard/context', () => ({
  getActionContext: vi.fn(),
}));

vi.mock('./agent-dashboard/get', () => ({
  getAgentDashboardDataCore: vi.fn(),
}));

describe('actions/agent-dashboard wrapper', () => {
  it('delegates to core with session from context', async () => {
    const { getActionContext } = await import('./agent-dashboard/context');
    const { getAgentDashboardDataCore } = await import('./agent-dashboard/get');

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'u1', role: 'staff' } },
    });

    (getAgentDashboardDataCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      stats: { total: 1, new: 1, inProgress: 0, completed: 0 },
      recentClaims: [],
    });

    const result = await getAgentDashboardData();

    expect(getAgentDashboardDataCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1', role: 'staff' } },
    });
    expect(result).toEqual({
      stats: { total: 1, new: 1, inProgress: 0, completed: 0 },
      recentClaims: [],
    });
  });
});
