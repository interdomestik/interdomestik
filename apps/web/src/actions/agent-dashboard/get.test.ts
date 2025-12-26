import { describe, expect, it } from 'vitest';

import type { Session } from './context';
import { getAgentDashboardDataCore } from './get';

describe('actions/agent-dashboard getAgentDashboardDataCore', () => {
  it('returns empty stats for agent role without hitting DB', async () => {
    const result = await getAgentDashboardDataCore({
      session: { user: { id: 'a1', role: 'agent' } } as unknown as NonNullable<Session>,
    });

    expect(result).toEqual({
      stats: { total: 0, new: 0, inProgress: 0, completed: 0 },
      recentClaims: [],
    });
  });
});
