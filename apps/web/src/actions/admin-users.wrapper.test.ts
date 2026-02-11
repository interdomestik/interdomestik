import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateUserAgentCore: vi.fn(),
  getUsersCore: vi.fn(),
  getAgentsCore: vi.fn(),
  getStaffCore: vi.fn(),
}));

vi.mock('./admin-users/update-user-agent.core', () => ({
  updateUserAgentCore: (...args: unknown[]) => mocks.updateUserAgentCore(...args),
}));

vi.mock('./admin-users/get-users', () => ({
  getUsersCore: (...args: unknown[]) => mocks.getUsersCore(...args),
}));

vi.mock('./admin-users/get-agents', () => ({
  getAgentsCore: (...args: unknown[]) => mocks.getAgentsCore(...args),
}));

vi.mock('./admin-users/get-staff', () => ({
  getStaffCore: (...args: unknown[]) => mocks.getStaffCore(...args),
}));

vi.mock('./admin-users/context', () => ({
  getActionContext: vi.fn(async () => ({
    requestHeaders: new Headers(),
    session: { user: { id: 'admin-1', role: 'admin', tenantId: 't1' } },
  })),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: 'admin-1', role: 'admin', tenantId: 't1' },
      })),
    },
  },
}));

vi.mock('@/server/auth/effective-portal-access', () => ({
  requireEffectivePortalAccessOrUnauthorized: vi.fn(async () => undefined),
}));

let actions: typeof import('./admin-users');

describe('admin-users action wrappers', () => {
  beforeAll(async () => {
    actions = await import('./admin-users');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateUserAgent delegates to core', async () => {
    mocks.updateUserAgentCore.mockResolvedValue({ success: true });

    const result = await actions.updateUserAgent('user-1', 'agent-1');

    expect(mocks.updateUserAgentCore).toHaveBeenCalledWith({
      session: { user: { id: 'admin-1', role: 'admin', tenantId: 't1' } },
      userId: 'user-1',
      agentId: 'agent-1',
    });
    expect(result).toEqual({ success: true });
  });

  it('getUsers delegates to core', async () => {
    const filters = { search: 'alice', role: 'user', assignment: 'assigned' };
    mocks.getUsersCore.mockResolvedValue([{ id: 'u1' }]);

    const result = await actions.getUsers(filters);

    expect(mocks.getUsersCore).toHaveBeenCalledWith({
      session: { user: { id: 'admin-1', role: 'admin', tenantId: 't1' } },
      filters,
    });
    expect(result).toEqual({ success: true, data: [{ id: 'u1' }] });
  });

  it('getAgents delegates to core', async () => {
    // getAgents internally calls getUsersCore with role='agent'
    mocks.getUsersCore.mockResolvedValue([{ id: 'a1' }]);

    const result = await actions.getAgents();

    expect(mocks.getUsersCore).toHaveBeenCalledWith({
      session: { user: { id: 'admin-1', role: 'admin', tenantId: 't1' } },
      filters: { role: 'agent' },
    });
    expect(result).toEqual({ success: true, data: [{ id: 'a1' }] });
  });

  it('getStaff delegates to core', async () => {
    // getStaff internally calls getUsersCore with all handler-capable roles
    mocks.getUsersCore.mockResolvedValue([{ id: 's1' }]);

    const result = await actions.getStaff();

    expect(mocks.getUsersCore).toHaveBeenCalledWith({
      session: { user: { id: 'admin-1', role: 'admin', tenantId: 't1' } },
      filters: { role: 'staff,tenant_admin,branch_manager' },
    });
    expect(result).toEqual({ success: true, data: [{ id: 's1' }] });
  });
});
