import { describe, expect, it } from 'vitest';

import { getAgentUsersCore } from './get';

describe('actions/agent-users getAgentUsersCore', () => {
  it('throws Unauthorized when session is missing', async () => {
    await expect(getAgentUsersCore({ session: null })).rejects.toThrow('Unauthorized');
  });
});
