import { describe, expect, it, vi } from 'vitest';

import { getAgentUsers } from './agent-users';

vi.mock('./agent-users/context', () => ({
  getActionContext: vi.fn(),
}));

vi.mock('./agent-users/get', () => ({
  getAgentUsersCore: vi.fn(),
}));

describe('actions/agent-users wrapper', () => {
  it('delegates to core with session from context', async () => {
    const { getActionContext } = await import('./agent-users/context');
    const { getAgentUsersCore } = await import('./agent-users/get');

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'a1', role: 'agent' } },
    });

    (getAgentUsersCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'u1' }]);

    const result = await getAgentUsers({ search: 'test', limit: 10, offset: 0 });

    expect(getAgentUsersCore).toHaveBeenCalledWith({
      session: { user: { id: 'a1', role: 'agent' } },
      filters: { search: 'test', limit: 10, offset: 0 },
    });

    expect(result).toEqual([{ id: 'u1' }]);
  });
});
