import { describe, expect, it, vi } from 'vitest';

import { getAgentLeaderboard } from './leaderboard';

vi.mock('./leaderboard/context', () => ({
  getActionContext: vi.fn(async () => ({
    session: { user: { id: 'agent-1', role: 'agent' } },
  })),
}));

vi.mock('./leaderboard/get', () => ({
  getAgentLeaderboardCore: vi.fn(async () => ({
    success: true,
    data: { topAgents: [], currentUserRank: null, period: 'month' },
  })),
}));

describe('leaderboard action wrapper', () => {
  it('delegates getAgentLeaderboard to core', async () => {
    const { getActionContext } = await import('./leaderboard/context');
    const { getAgentLeaderboardCore } = await import('./leaderboard/get');

    const result = await getAgentLeaderboard('week');

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(getAgentLeaderboardCore).toHaveBeenCalledWith({
      session: { user: { id: 'agent-1', role: 'agent' } },
      period: 'week',
    });
    expect(result).toEqual({
      success: true,
      data: { topAgents: [], currentUserRank: null, period: 'month' },
    });
  });
});
