import { describe, expect, it } from 'vitest';

import { getAgentLeaderboardCore } from './get';

describe('getAgentLeaderboardCore', () => {
  it('denies access for non-agent/staff/admin roles', async () => {
    const result = await getAgentLeaderboardCore({
      session: {
        user: { id: 'user-1', role: 'user' },
      } as unknown as NonNullable<import('./context').Session>,
      period: 'month',
    });

    expect(result).toEqual({ success: false, error: 'Access denied' });
  });
});
